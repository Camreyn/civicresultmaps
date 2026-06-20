import unittest
import zipfile
import json
from pathlib import Path
from xml.sax.saxutils import escape

from civic_etl.cli import main
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

    def test_minnesota_native_staging_parses_precinct_workbook(self):
        config = load_config("etl/state-configs/mn.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 87)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 3253920)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 4075)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 4075)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 4103)
        self.assertTrue(any(row["coverageMode"] == "presidentVsSenate" for row in artifact["native"]["reviewRows"]))

    def test_pennsylvania_native_staging_parses_bulk_files(self):
        config = load_config("etl/state-configs/pa.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 67)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 7031737)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 9154)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 9152)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 67)
        self.assertTrue(any(row["coverageMode"] == "voteShareOnly" for row in artifact["native"]["reviewRows"]))

    def test_michigan_native_staging_parses_mvic_package(self):
        registration = json.loads(Path("data/mi-2024-registered-voter-count.json").read_text(encoding="utf-8"))
        config = load_config("etl/state-configs/mi.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertEqual(registration["extractedCountyRows"], 83)
        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 83)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 5664186)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 4428)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 4416)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 83)
        self.assertTrue(any(row["coverageMode"] == "voteShareOnly" for row in artifact["native"]["reviewRows"]))

    def test_north_carolina_native_staging_parses_precinct_zip(self):
        config = load_config("etl/state-configs/nc.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeNorthCarolinaPrecinctResultsZip")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 100)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 5699141)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 2898423)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 2715375)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 85343)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 2861)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 2861)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "North Carolina Governor")
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 100)
        self.assertEqual(artifact["native"]["metrics"]["nativeRegisteredVoters"], 7854464)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 5756106)
        self.assertTrue(any(row["coverageMode"] == "presidentVsGovernor" for row in artifact["native"]["reviewRows"]))

    def test_washington_native_staging_parses_official_csv_exports(self):
        config = load_config("etl/state-configs/wa.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeWashingtonCsvExports")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 39)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 3924243)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 1530923)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 2245849)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 147471)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 5007)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 4994)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "United States Senator")
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewCertifiedVoteGap"], 5309)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 39)
        self.assertEqual(artifact["native"]["metrics"]["nativeRegisteredVoters"], 5597156)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 3949810)
        self.assertTrue(any(row["coverageMode"] == "presidentVsSenate" for row in artifact["native"]["reviewRows"]))
        self.assertTrue(any(row["coverageMode"] == "voteShareOnly" for row in artifact["native"]["reviewRows"]))

    def test_arizona_canvass_parser_builds_county_rows_and_turnout(self):
        config = load_config("etl/state-configs/az.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeArizonaCanvassCountyCsv")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 15)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 3390161)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 1770242)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 1582860)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 37059)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 15)
        self.assertEqual(artifact["native"]["metrics"]["nativeRegisteredVoters"], 4367593)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 3428011)
        self.assertEqual(artifact["native"]["reviewRows"], [])

    def test_nevada_statewide_results_parser_builds_county_rows(self):
        config = load_config("etl/state-configs/nv.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeNevadaStatewideGeneralCsv")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 17)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 1484840)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 751205)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 705197)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 28438)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 17)
        self.assertEqual(artifact["native"]["metrics"]["nativeRegisteredVoters"], 2256275)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 1486297)
        self.assertEqual(artifact["native"]["reviewRows"], [])

    def test_georgia_media_export_parser_builds_native_rows(self):
        config = load_config("etl/state-configs/ga.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeGeorgiaMediaExportJson")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 159)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 5250066)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 2663117)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 2548017)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 38932)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 2684)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewZeroTotalRowsOmitted"], 17)
        self.assertEqual(artifact["native"]["metrics"]["nativeStatewideCertifiedVoteGap"], 19)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 159)
        self.assertTrue(any(row["coverageMode"] == "voteShareOnly" for row in artifact["native"]["reviewRows"]))

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

    def test_normalized_turnout_only_staging_parses_csv_contract(self):
        tmp = self.fixture_dir("normalized-turnout")
        csv_path = tmp / "az-turnout.csv"
        config_path = tmp / "az.json"
        csv_path.write_text(
            "\n".join(
                [
                    "state,election_year,jurisdiction_name,level,ballots_cast,registered_voters,denominator_note,warning_required,source_url",
                    "AZ,2024,Maricopa County,county,200,250,EAC-reported registered-voter denominator,false,https://www.eac.gov/research-and-data/studies-and-reports",
                    "AZ,2024,Pima County,county,100,,Missing registered-voter denominator,true,https://www.eac.gov/research-and-data/studies-and-reports",
                ]
            )
            + "\n",
            encoding="utf-8",
        )
        config_path.write_text(
            json.dumps(
                {
                    "code": "AZ",
                    "name": "Arizona",
                    "authority": "Arizona Secretary of State",
                    "electionYear": 2024,
                    "office": "President",
                    "turnoutOnly": True,
                    "sources": [
                        {
                            "id": "az-normalized-turnout",
                            "category": "Normalized turnout rows",
                            "url": "https://www.eac.gov/research-and-data/studies-and-reports",
                            "localFile": csv_path.as_posix(),
                            "parser": "normalizedTurnoutCsv",
                            "authority": "U.S. Election Assistance Commission",
                            "timestampBasis": "Fixture",
                            "confidence": "Fixture",
                            "status": "loaded",
                        }
                    ],
                    "turnout": {
                        "format": "normalizedTurnoutCsv",
                        "sourceId": "az-normalized-turnout",
                        "sourceLevel": "county",
                        "expected": {
                            "rowCount": 2,
                            "ballotsCast": 300,
                            "registeredVoters": 250,
                        },
                    },
                    "expected": {
                        "jurisdictions": 0,
                        "resultRows": 0,
                        "sources": 1,
                        "reviewRows": 0,
                        "turnoutRows": 2,
                    },
                    "capabilities": {
                        "sourcePlanner": True,
                        "certifiedResults": False,
                        "map": False,
                        "reviewGraphs": False,
                        "turnout": True,
                        "historicalBaseline": False,
                    },
                }
            ),
            encoding="utf-8",
        )

        config = load_config(config_path)
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 2)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 300)
        self.assertEqual(artifact["native"]["turnoutRows"][0]["turnoutPct"], 80)
        self.assertTrue(artifact["native"]["turnoutRows"][1]["warningRequired"])

    def test_staging_artifact_blocks_production_write(self):
        config = load_config("etl/state-configs/wi.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertEqual(artifact["promotion"]["status"], "staged")
        self.assertTrue(artifact["promotion"]["requiresHumanReview"])
        self.assertFalse(artifact["promotion"]["productionWriteAllowed"])
        self.assertTrue(artifact["sources"][0]["metadata"]["artifacts"][0]["exists"])
        self.assertRegex(artifact["sources"][0]["metadata"]["artifacts"][0]["sha256"], r"^[0-9a-f]{64}$")
        self.assertGreater(artifact["sources"][0]["metadata"]["artifacts"][0]["byteSize"], 0)
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

    def test_validate_all_configs_command(self):
        tmp = self.fixture_dir("validate-all")
        status = main(["validate-all", "--config-dir", "etl/state-configs", "--out", str(tmp)])

        self.assertEqual(status, 0)
        staged_files = list(tmp.glob("*-2024-staging.json"))
        self.assertEqual(len(staged_files), 50)
        for state in ["ak", "az", "ga", "mi", "mn", "nc", "nv", "oh", "pa", "wa", "wi", "wy"]:
            self.assertTrue((tmp / f"{state}-2024-staging.json").exists())


if __name__ == "__main__":
    unittest.main()
