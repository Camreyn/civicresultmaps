import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";

const searchUrl =
  "https://records.sos.state.or.us/ORSOSCMSearch/Search/SearchMain.aspx?t1=notes&q1=2024+General+Election+Precinct+Level+Results&op1=AND&arch=0&page=1&size=50";
const outDir = "data/or-2024-precinct-data";
const cookies = new Map();


function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function textOnly(value) {
  return decodeHtml(String(value ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " "));
}

function slug(value) {
  return textOnly(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function rememberCookies(setCookieHeaders = []) {
  for (const header of setCookieHeaders) {
    const [pair] = String(header).split(";");
    const [name, value] = pair.split("=");
    if (name && value !== undefined) {
      cookies.set(name, value);
    }
  }
}

function cookieHeader() {
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const requestOptions = new URL(url);
    const headers = { Connection: "close", ...(options.headers ?? {}) };
    const cookie = cookieHeader();
    if (cookie) {
      headers.Cookie = cookie;
    }
    const req = https.request(
      requestOptions,
      {
        method: options.method ?? "GET",
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);
          rememberCookies(res.headers["set-cookie"] ?? []);
          const location = res.headers.location;
          if (location && [301, 302, 303, 307, 308].includes(res.statusCode ?? 0)) {
            const redirectUrl = new URL(location, url).toString();
            const redirectKeepsBody = [307, 308].includes(res.statusCode ?? 0);
            resolve(request(redirectUrl, redirectKeepsBody ? options : {}, redirectKeepsBody ? body : null));
            return;
          }
          resolve({ buffer, headers: res.headers, status: res.statusCode ?? 0, url });
        });
      },
    );
    req.on("error", reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function formFields(html) {
  const fields = {};
  for (const match of html.matchAll(/<input[^>]+>/g)) {
    const tag = match[0];
    const name = tag.match(/\bname="([^"]+)"/)?.[1];
    if (!name || /\btype="submit"/i.test(tag)) {
      continue;
    }
    fields[decodeHtml(name)] = decodeHtml(tag.match(/\bvalue="([^"]*)"/)?.[1] ?? "");
  }
  return fields;
}

function formEncode(fields) {
  return new URLSearchParams(fields).toString();
}

function parseRecords(html) {
  const records = [];
  for (const row of html.matchAll(/<tr class="rg(?:Alt)?Row"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((cell) => textOnly(cell[1]));
    if (cells.length < 4) {
      continue;
    }
    const target = row[1].match(/__doPostBack\(&#39;([^']+)&#39;,&#39;([^']*)&#39;\)/);
    records.push({
      title: cells[0],
      createdAt: cells[1],
      recordNumber: cells[2],
      extension: cells[3].toLowerCase(),
      postbackTarget: decodeHtml(target?.[1] ?? ""),
    });
  }
  return records;
}


async function detailPage(record) {
  const query = new URLSearchParams({
    t1: "number",
    q1: record.recordNumber,
    op1: "AND",
    t2: "notes",
    q2: "2024 General Election Precinct Level Results",
    op2: "AND",
    arch: "0",
    page: "1",
    size: "25",
  });
  const search = await request(`https://records.sos.state.or.us/ORSOSCMSearch/Search/SearchMain.aspx?${query}`);
  const html = search.buffer.toString("utf8");
  const fields = formFields(html);
  const target = parseRecords(html)[0]?.postbackTarget;
  if (!target) {
    throw new Error(`Could not find detail postback target for ${record.recordNumber}`);
  }
  fields.__EVENTTARGET = target;
  fields.__EVENTARGUMENT = "";
  const body = formEncode(fields);
  const detail = await request(
    search.url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
        Referer: search.url,
      },
    },
    body,
  );
  if (detail.status !== 200 || !/SearchDetail\.aspx\?uri=/.test(detail.url)) {
    throw new Error(`Could not resolve detail page for ${record.recordNumber}; got ${detail.status} ${detail.url}`);
  }
  return detail;
}

async function downloadDocument(detail, record) {
  const detailHtml = detail.buffer.toString("utf8");
  const fields = formFields(detailHtml);
  fields["ctl00$ContentPlaceHolder1$lnkDownload"] = "Download";
  const body = formEncode(fields);
  const response = await request(
    detail.url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
        Referer: detail.url,
      },
    },
    body,
  );
  const contentType = String(response.headers["content-type"] ?? "");
  if (response.status !== 200 || !/(application\/pdf|text\/csv|application\/octet-stream|csv)/i.test(contentType)) {
    throw new Error(`Download failed for ${record.recordNumber}; got ${response.status} ${contentType}`);
  }
  const disposition = String(response.headers["content-disposition"] ?? "");
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? `${record.title}.${record.extension}`;
  const normalizedFilename = `${slug(record.title)}.${record.extension}`;
  const filePath = path.join(outDir, normalizedFilename);
  fs.writeFileSync(filePath, response.buffer);
  const sha256 = crypto.createHash("sha256").update(response.buffer).digest("hex");
  return {
    ...record,
    detailUrl: detail.url,
    contentType,
    downloadedFilename: filename,
    localFile: filePath.replaceAll("\\", "/"),
    byteSize: response.buffer.length,
    sha256,
  };
}

fs.mkdirSync(outDir, { recursive: true });

const searchResponse = await request(searchUrl);
if (searchResponse.status !== 200) {
  throw new Error(`Search page failed with HTTP ${searchResponse.status}`);
}
const records = parseRecords(searchResponse.buffer.toString("utf8"));
const seen = new Set();
const uniqueRecords = records.filter((record) => {
  if (seen.has(record.recordNumber)) {
    return false;
  }
  seen.add(record.recordNumber);
  return true;
});

const downloaded = [];
for (const record of uniqueRecords) {
  const detail = await detailPage(record);
  downloaded.push(await downloadDocument(detail, record));
  console.log(`${record.recordNumber} ${record.title}`);
}

const manifest = {
  collectedAt: new Date().toISOString(),
  sourceUrl: searchUrl,
  recordCount: downloaded.length,
  records: downloaded,
};
fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ outDir, recordCount: downloaded.length }, null, 2));
