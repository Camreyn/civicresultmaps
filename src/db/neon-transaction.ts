import { Client, type NeonQueryFunction } from "@neondatabase/serverless";

type QueryResult = {
  rows?: unknown[];
};

export type TransactionClient = {
  connect: () => Promise<void>;
  end: () => Promise<void>;
  query: (text: string, values?: unknown[]) => Promise<QueryResult>;
};

function sqlText(strings: TemplateStringsArray) {
  return strings.reduce(
    (text, part, index) => text + (index === 0 ? "" : `$${index}`) + part,
    "",
  );
}

export function transactionSql(client: Pick<TransactionClient, "query">) {
  return (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const result = await client.query(sqlText(strings), values);
    return result.rows ?? [];
  }) as NeonQueryFunction<false, false>;
}

export async function withTransactionClient<T>(
  client: TransactionClient,
  work: (sql: NeonQueryFunction<false, false>) => Promise<T>,
) {
  let connected = false;
  let failure: unknown;

  try {
    await client.connect();
    connected = true;
    await client.query("begin");
    const result = await work(transactionSql(client));
    await client.query("commit");
    return result;
  } catch (error) {
    failure = error;
    if (connected) {
      try {
        await client.query("rollback");
      } catch {
        // Preserve the original promotion failure.
      }
    }
    throw error;
  } finally {
    if (connected) {
      try {
        await client.end();
      } catch (error) {
        if (!failure) {
          throw error;
        }
      }
    }
  }
}
export async function runNeonTransaction<T>(
  databaseUrl: string,
  work: (sql: NeonQueryFunction<false, false>) => Promise<T>,
) {
  const client = new Client({ connectionString: databaseUrl });
  return withTransactionClient({
    connect: () => client.connect(),
    end: () => client.end(),
    query: async (text, values = []) => {
      const result = await client.query(text, values);
      return { rows: result.rows };
    },
  }, work);
}