from __future__ import annotations

import io
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree

NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkgrel": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def _text(element: ElementTree.Element | None) -> str:
    if element is None:
        return ""
    return "".join(element.itertext())


def _column_index(cell_ref: str) -> int:
    letters = re.sub(r"[^A-Z]", "", cell_ref.upper())
    index = 0
    for letter in letters:
        index = (index * 26) + (ord(letter) - ord("A") + 1)
    return index - 1


def _coerce(value: str) -> str | int | float:
    value = value.strip()
    if not value:
        return ""
    try:
        number = float(value)
    except ValueError:
        return value
    if number.is_integer():
        return int(number)
    return number


def _shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        xml = archive.read("xl/sharedStrings.xml")
    except KeyError:
        return []

    root = ElementTree.fromstring(xml)
    return [_text(item) for item in root.findall("main:si", NS)]


def _sheet_path(archive: zipfile.ZipFile, sheet_name: str) -> str:
    workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
    rels = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    rel_targets = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rels.findall("pkgrel:Relationship", NS)
    }

    for sheet in workbook.findall("main:sheets/main:sheet", NS):
        if sheet.attrib.get("name") != sheet_name:
            continue
        rel_id = sheet.attrib[f"{{{NS['rel']}}}id"]
        target = rel_targets[rel_id].lstrip("/")
        return target if target.startswith("xl/") else f"xl/{target}"

    available = [sheet.attrib.get("name", "") for sheet in workbook.findall("main:sheets/main:sheet", NS)]
    raise ValueError(f"worksheet {sheet_name!r} not found; available sheets: {', '.join(available)}")


def read_xlsx_sheet(path: str | Path, sheet_name: str) -> list[list[str | int | float]]:
    with zipfile.ZipFile(path) as archive:
        strings = _shared_strings(archive)
        worksheet = ElementTree.fromstring(archive.read(_sheet_path(archive, sheet_name)))

    rows: list[list[str | int | float]] = []
    for row in worksheet.findall("main:sheetData/main:row", NS):
        values: list[str | int | float] = []
        for cell in row.findall("main:c", NS):
            ref = cell.attrib.get("r", "")
            column = _column_index(ref) if ref else len(values)
            while len(values) <= column:
                values.append("")

            cell_type = cell.attrib.get("t")
            if cell_type == "s":
                raw = _text(cell.find("main:v", NS))
                values[column] = strings[int(raw)] if raw else ""
            elif cell_type == "inlineStr":
                values[column] = _text(cell.find("main:is", NS))
            else:
                values[column] = _coerce(_text(cell.find("main:v", NS)))

        while values and values[-1] == "":
            values.pop()
        rows.append(values)

    return rows



def _read_xlsx_sheet_from_archive(archive: zipfile.ZipFile, sheet_name: str) -> list[list[str | int | float]]:
    strings = _shared_strings(archive)
    worksheet = ElementTree.fromstring(archive.read(_sheet_path(archive, sheet_name)))

    rows: list[list[str | int | float]] = []
    for row in worksheet.findall("main:sheetData/main:row", NS):
        values: list[str | int | float] = []
        for cell in row.findall("main:c", NS):
            ref = cell.attrib.get("r", "")
            column = _column_index(ref) if ref else len(values)
            while len(values) <= column:
                values.append("")

            cell_type = cell.attrib.get("t")
            if cell_type == "s":
                raw = _text(cell.find("main:v", NS))
                values[column] = strings[int(raw)] if raw else ""
            elif cell_type == "inlineStr":
                values[column] = _text(cell.find("main:is", NS))
            else:
                values[column] = _coerce(_text(cell.find("main:v", NS)))

        while values and values[-1] == "":
            values.pop()
        rows.append(values)

    return rows


def read_xlsx_sheet_bytes(data: bytes, sheet_name: str) -> list[list[str | int | float]]:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        return _read_xlsx_sheet_from_archive(archive, sheet_name)


def xlsx_sheet_names_bytes(data: bytes) -> list[str]:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
    return [sheet.attrib.get("name", "") for sheet in workbook.findall("main:sheets/main:sheet", NS)]
