function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]!);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!);
    const row: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      row[header[j]!] = cols[j] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

async function movebankFetch(
  params: Record<string, string>,
): Promise<Record<string, string>[]> {
  const user = process.env["MOVEBANK_USERNAME"];
  const pass = process.env["MOVEBANK_PASSWORD"];
  if (!user || !pass) return [];
  const qs = new URLSearchParams(params);
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");
  const r = await fetch(
    `https://www.movebank.org/movebank/service/direct-read?${qs}`,
    { headers: { Authorization: `Basic ${auth}` } },
  );
  if (!r.ok) return [];
  return parseCsv(await r.text());
}

export type MovebankStudy = {
  id: string;
  name: string;
  principalInvestigator?: string;
  location?: string;
  citation?: string;
};

export type MovebankIndividual = {
  id: string;
  name: string;
  sex?: string;
};

let studiesCache: { ts: number; rows: Record<string, string>[] } | null = null;

async function getAllAccessibleStudies(): Promise<Record<string, string>[]> {
  const now = Date.now();
  if (studiesCache && now - studiesCache.ts < 5 * 60_000) {
    return studiesCache.rows;
  }
  const rows = await movebankFetch({
    entity_type: "study",
    i_can_see_data: "true",
  });
  studiesCache = { ts: now, rows };
  return rows;
}

export async function searchMovebankStudies(
  scientificName: string,
): Promise<MovebankStudy[]> {
  const rows = await getAllAccessibleStudies();
  const needle = scientificName.toLowerCase().split(" ")[0] ?? "";
  const matches = rows.filter((r) => {
    const taxa = (r["taxon_ids"] ?? "").toLowerCase();
    return needle.length > 0 && taxa.includes(needle);
  });
  return matches.slice(0, 50).map((r) => {
    const id = r["id"] ?? "";
    const name = r["name"] ?? r["id"] ?? "(unnamed study)";
    const pi =
      r["principal_investigator_name"] || r["contact_person_name"] || undefined;
    return {
      id,
      name,
      principalInvestigator: pi,
      location: r["study_objective"] || undefined,
      citation: r["citation"] || undefined,
    };
  });
}

export async function listMovebankIndividuals(
  studyId: string,
): Promise<MovebankIndividual[]> {
  const rows = await movebankFetch({
    entity_type: "individual",
    study_id: studyId,
  });
  return rows.slice(0, 200).map((r) => ({
    id: r["local_identifier"] || r["id"] || "",
    name: r["local_identifier"] || r["nick_name"] || r["id"] || "",
    sex: r["sex"] || undefined,
  }));
}
