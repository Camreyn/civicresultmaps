import unittest
import zipfile
import json
from pathlib import Path
from xml.sax.saxutils import escape

from civic_etl.pipeline import (
    build_staging_artifact,
    load_config,
    validate_config,
    write_staging_artifact,
)
from civic_etl.xlsx import read_xlsx_sheet


def write_xlsx(path: Path, sheet_name: str, rows: list[list[object]]):
    def cell_ref(column_index: int, row_index: int) -> str:
        column = ""
        current = column_index + 1
        while current:
            current, remainder = divmod(current - 1, 26)
            column = chr(ord("A") + remainder) + column
        return f"{column}{row_index}"

    sheet_rows = []
    for row_index, row in enumerate(rows, start=1):
        cells = []
        for column_index, value in enumerate(row):
            ref = cell_ref(column_index, row_index)
            if isinstance(value, (int, float)):
                cells.append(f'<c r="{ref}"><v>{value}</v></c>')
            else:
                cells.append(f'<c r="{ref}" t="inlineStr"><is><t>{escape(str(value))}</t></is></c>')
        sheet_rows.append(f'<row r="{row_index}">{"".join(cells)}</row>')

    worksheet = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(sheet_rows)}</sheetData>'
        "</worksheet>"
    )
    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<sheets><sheet name="{escape(sheet_name)}" sheetId="1" r:id="rId1"/></sheets>'
        "</workbook>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        "</Relationships>"
    )
    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>"
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        "</Types>"
    )
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", root_rels)
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", rels)
        archive.writestr("xl/worksheets/sheet1.xml", worksheet)


class PipelineTests(unittest.TestCase):
    def fixture_dir(self, name: str) -> Path:
        path = Path(".etl-test") / name
        path.mkdir(parents=True, exist_ok=True)
        return path

    def test_wisconsin_config_validates(self):
        config = load_config("etl/state-configs/wi.json")
        report = validate_config(config)

        self.assertTrue(report.passed)
        self.assertEqual(report.metrics["state"], "WI")
        self.assertEqual(report.metrics["expectedJurisdictions"], 72)

    def test_ohio_config_validates(self):
        config = load_config("etl/state-configs/oh.json")
        report = validate_config(config)

        self.assertTrue(report.passed)
        self.assertEqual(report.metrics["state"], "OH")
        self.assertEqual(report.metrics["expectedJurisdictions"], 88)
        self.assertEqual(report.metrics["expectedReviewRows"], 8878)

    def test_xlsx_reader_reads_inline_strings_and_numbers(self):
        tmp = self.fixture_dir("xlsx-reader")
        path = tmp / "sample.xlsx"
        write_xlsx(path, "President and Vice President", [["County", "Votes"], ["Alpha", 12]])

        rows = read_xlsx_sheet(path, "President and Vice President")

        self.assertEqual(rows, [["County", "Votes"], ["Alpha", 12]])

    def test_ohio_native_staging_parses_official_workbook_shapes(self):
        tmp = self.fixture_dir("ohio-native")
        summary = tmp / "oh-summary.xlsx"
        precinct = tmp / "oh-precinct.xlsx"
        config_path = tmp / "oh.json"
        write_xlsx(
            summary,
            "President and Vice President",
            [
                ["Title"],
                ["County", "Donald J. Trump", "Kamala D. Harris", "Other Person"],
                ["Total", 30, 20, 5],
                [""],
                ["Alpha", 10, 12, 2],
                ["Beta", 20, 8, 3],
            ],
        )
        write_xlsx(
            precinct,
            "President and Vice President",
            [
                ["Title"],
                [
                    "County Name",
                    "Precinct Name",
                    "Precinct Code",
                    "Registered Voters",
                    "Ballots Counted",
                    "Donald J. Trump",
                    "Kamala D. Harris",
                ],
                ["Total", "", "", 300, 170, 90, 65],
                [""],
                ["Alpha", "Precinct 1", "001", 100, 60, 20, 35],
                ["Beta", "Precinct 2", "002", 200, 110, 70, 30],
            ],
        )
        config_path.write_text(
            json.dumps(
                {
                    "code": "OH",
                    "name": "Ohio",
                    "authority": "Ohio Secretary of State",
                    "electionYear": 2024,
                    "office": "President",
                    "sources": [
                        {
                            "id": "summary",
                            "category": "Official presidential county results",
                            "url": "https://example.test/summary.xlsx",
                            "localFile": summary.as_posix(),
                            "parser": "ohioStatewideRaceSummaryXlsx",
                            "authority": "Ohio Secretary of State",
                            "timestampBasis": "Fixture",
                            "confidence": "Fixture",
                            "status": "loaded",
                        },
                        {
                            "id": "precinct",
                            "category": "Official precinct presidential rows",
                            "url": "https://example.test/precinct.xlsx",
                            "localFile": precinct.as_posix(),
                            "parser": "ohioPrecinctOfficialXlsx",
                            "authority": "Ohio Secretary of State",
                            "timestampBasis": "Fixture",
                            "confidence": "Fixture",
                            "status": "loaded",
                        },
                    ],
                    "certifiedResults": {
                        "format": "ohioStatewideRaceSummaryXlsx",
                        "sourceId": "summary",
                        "sheetName": "President and Vice President",
                        "headerRow": 2,
                        "totalRow": 3,
                        "dataStartRow": 5,
                        "majorCandidates": {
                            "trump": {"candidateContains": "Donald J. Trump"},
                            "harris": {"candidateContains": "Kamala D. Harris"},
                        },
                        "otherCandidates": [
                            {"key": "other", "label": "Other Person", "candidateContains": "Other Person"}
                        ],
                    },
                    "reviewCharts": {
                        "format": "ohioPrecinctVoteShare",
                        "sourceId": "precinct",
                        "sheetName": "President and Vice President",
                        "headerRow": 2,
                        "dataStartRow": 5,
                        "totalColumn": "Ballots Counted",
                        "majorCandidates": {
                            "trump": {"candidateContains": "Donald J. Trump"},
                            "harris": {"candidateContains": "Kamala D. Harris"},
                        },
                    },
                    "turnout": {
                        "format": "ohioPrecinctTurnoutXlsx",
                        "sourceId": "precinct",
                        "sheetName": "President and Vice President",
                        "headerRow": 2,
                        "dataStartRow": 5,
                        "statewideTotals": {"registeredVoters": 300, "ballotsCast": 170},
                    },
                    "expected": {
                        "jurisdictions": 2,
                        "resultRows": 2,
                        "sources": 2,
                        "stateTotal": 55,
                        "trump": 30,
                        "harris": 20,
                        "other": 5,
                        "reviewRows": 2,
                        "turnoutRows": 2,
                    },
                    "capabilities": {
                        "sourcePlanner": True,
                        "certifiedResults": True,
                        "map": True,
                        "reviewGraphs": True,
                        "turnout": True,
                        "historicalBaseline": False,
                    },
                }
            )
        )

        config = load_config(config_path)
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertFalse(artifact["promotion"]["productionWriteAllowed"])
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 2)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 2)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 2)
        self.assertEqual(artifact["native"]["resultRows"][0]["jurisdictionName"], "Alpha County")

    def test_staging_artifact_blocks_production_write(self):
        config = load_config("etl/state-configs/wi.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertEqual(artifact["promotion"]["status"], "staged")
        self.assertTrue(artifact["promotion"]["requiresHumanReview"])
        self.assertFalse(artifact["promotion"]["productionWriteAllowed"])
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 3503)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "United States Senator")
        self.assertTrue(any(row["coverageMode"] == "presidentVsSenate" for row in artifact["native"]["reviewRows"]))
        self.assertTrue(any(row["demDropoff"] != 0 or row["repDropoff"] != 0 for row in artifact["native"]["reviewRows"]))

    def test_write_staging_artifact(self):
        config = load_config("etl/state-configs/wi.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        tmp = self.fixture_dir("staging-artifact")
        path = write_staging_artifact(artifact, tmp)
        try:
            self.assertEqual(Path(path).name, "wi-2024-staging.json")
            self.assertIn('"productionWriteAllowed": false', Path(path).read_text())
        finally:
            path.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
