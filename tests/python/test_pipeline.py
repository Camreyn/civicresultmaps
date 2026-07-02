import unittest
from dataclasses import replace
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


def write_xlsx_workbook(path: Path, sheets: dict[str, list[list[object]]]):
    def cell_ref(column_index: int, row_index: int) -> str:
        column = ""
        current = column_index + 1
        while current:
            current, remainder = divmod(current - 1, 26)
            column = chr(ord("A") + remainder) + column
        return f"{column}{row_index}"

    worksheets = []
    for sheet_index, (sheet_name, rows) in enumerate(sheets.items(), start=1):
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
        worksheets.append((sheet_index, sheet_name, worksheet))

    workbook_sheets = "".join(
        f'<sheet name="{escape(sheet_name)}" sheetId="{sheet_index}" r:id="rId{sheet_index}"/>'
        for sheet_index, sheet_name, _ in worksheets
    )
    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<sheets>{workbook_sheets}</sheets>'
        "</workbook>"
    )
    rels_entries = "".join(
        f'<Relationship Id="rId{sheet_index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{sheet_index}.xml"/>'
        for sheet_index, _, _ in worksheets
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'{rels_entries}'
        "</Relationships>"
    )
    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>"
    )
    overrides = "".join(
        f'<Override PartName="/xl/worksheets/sheet{sheet_index}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        for sheet_index, _, _ in worksheets
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        f'{overrides}'
        "</Types>"
    )
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", root_rels)
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", rels)
        for sheet_index, _, worksheet in worksheets:
            archive.writestr(f"xl/worksheets/sheet{sheet_index}.xml", worksheet)


class PipelineTests(unittest.TestCase):
    def fixture_dir(self, name: str) -> Path:
        path = Path(".etl-test") / name
        path.mkdir(parents=True, exist_ok=True)
        return path

    def test_config_rejects_source_statuses_outside_production_enum(self):
        config = load_config("etl/state-configs/wi.json")
        config = replace(
            config,
            sources=[replace(config.sources[0], status="partial"), *config.sources[1:]],
        )

        report = validate_config(config)

        self.assertFalse(report.passed)
        self.assertIn(
            "source wi-2024-ward-by-ward-federal-state-xlsx has invalid source status partial",
            report.errors[0],
        )

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
        self.assertFalse(artifact["capabilities"]["historicalBaseline"])
        self.assertEqual(len(artifact["native"].get("historicalRows", [])), 0)
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
        self.assertTrue(artifact["capabilities"]["historicalBaseline"])
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalRows"], 249)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        self.assertEqual(len(artifact["native"].get("historicalRows", [])), 249)
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
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 2658)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 2658)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "North Carolina Governor")
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewReportingUnitFilter"], "Real Precinct=Y")
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewExcludedReportingUnits"], 250)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewExcludedPresidentialVotes"], 1775402)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewPresidentialVotes"], 3923739)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewCertifiedVoteGap"], 1775402)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 100)
        self.assertEqual(artifact["native"]["metrics"]["nativeRegisteredVoters"], 7854464)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 5756106)
        self.assertTrue(any(row["coverageMode"] == "presidentVsGovernor" for row in artifact["native"]["reviewRows"]))

    def test_oklahoma_official_csv_zip_parser_builds_county_and_precinct_rows(self):
        config = load_config("etl/state-configs/ok.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeOklahomaOfficialCsvZip")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 77)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 1566173)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 1036213)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 499599)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 30361)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 1977)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 1517)
        self.assertEqual(artifact["native"]["metrics"]["nativeOklahomaHousePrecinctRows"], 1517)
        self.assertEqual(artifact["native"]["metrics"]["nativeOklahomaVoteShareOnlyRows"], 460)
        self.assertEqual(artifact["native"]["metrics"]["nativeOklahomaZeroTotalPresidentialPrecincts"], 9)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 77)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 1573274)
        self.assertEqual(artifact["native"]["metrics"]["nativeRegisteredVoters"], 2442211)
        adair = next(row for row in artifact["native"]["resultRows"] if row["jurisdictionName"] == "Adair County")
        self.assertEqual(adair["votes"]["Trump"], 5860)
        self.assertEqual(adair["votes"]["Harris"], 1289)
        self.assertEqual(adair["votes"]["Other"], 107)
        first_review = next(
            row
            for row in artifact["native"]["reviewRows"]
            if row["county"] == "Adair County" and row["localUnit"] == "010001"
        )
        self.assertEqual(first_review["coverageMode"], "presidentVsUSHouse")
        self.assertEqual(first_review["comparisonContest"], "FOR UNITED STATES REPRESENTATIVE DISTRICT 02")
        self.assertEqual(first_review["harris"], 47)
        self.assertEqual(first_review["trump"], 267)
        self.assertEqual(first_review["totalVotes"], 323)
        self.assertEqual(first_review["comparisonDemVotes"], 58)
        self.assertEqual(first_review["comparisonRepVotes"], 241)
        vote_share_only = next(
            row
            for row in artifact["native"]["reviewRows"]
            if row["county"] == "Alfalfa County" and row["localUnit"] == "020110"
        )
        self.assertEqual(vote_share_only["coverageMode"], "voteShareOnly")
        self.assertEqual(vote_share_only["comparisonDemVotes"], 0)
        self.assertEqual(vote_share_only["comparisonRepVotes"], 0)

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

    def test_illinois_native_staging_parses_official_by_office_csvs(self):
        config = load_config("etl/state-configs/il.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeIllinoisElectionResultsByOfficeCsvDirectory")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 108)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 5649779)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 2449079)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 3062863)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 137837)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 6655)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 6655)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "U.S. House")
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewMultiDistrictPrecinctsOmitted"], 292)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewUncontestedHousePrecinctsOmitted"], 3080)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 108)
        self.assertEqual(artifact["native"]["metrics"]["nativeRegisteredVoters"], 8970541)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 5717147)
        adams = next(row for row in artifact["native"]["resultRows"] if row["jurisdictionName"] == "Adams County")
        self.assertEqual(adams["votes"]["Trump"], 23161)
        self.assertEqual(adams["votes"]["Harris"], 8111)
        cache = next(
            row
            for row in artifact["native"]["reviewRows"]
            if row["county"] == "Alexander County" and row["localUnit"] == "CACHE"
        )
        self.assertEqual(cache["coverageMode"], "presidentVsHouseContestedPrecinct")
        self.assertEqual(cache["comparisonContest"], "12TH CONGRESS")
        self.assertEqual(cache["comparisonDemVotes"], 44)
        self.assertEqual(cache["comparisonRepVotes"], 45)

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
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 15)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 15)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "United States Senator")
        apache = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Apache County")
        self.assertEqual(apache["coverageMode"], "presidentVsSenate")
        self.assertEqual(apache["comparisonDemVotes"], 19901)
        self.assertEqual(apache["comparisonRepVotes"], 11283)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalRows"], 45)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        self.assertEqual(artifact["native"]["historicalRows"][0]["jurisdictionName"], "Apache County")

    def test_indiana_enr_county_json_parser_builds_county_rows(self):
        config = load_config("etl/state-configs/in.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeIndianaEnrCountyJson")
        self.assertEqual(len(artifact["sources"]), 12)
        turnout_source = next(source for source in artifact["sources"] if source["id"] == "in-2024-general-turnout")
        self.assertEqual(turnout_source["parser"], "normalizedTurnoutCsv")
        self.assertTrue(turnout_source["metadata"]["artifacts"][0]["exists"])
        equipment_source = next(source for source in artifact["sources"] if source["id"] == "in-2024-equipment-context")
        self.assertEqual(equipment_source["parser"], "verifiedVotingEquipmentContextCsv")
        self.assertTrue(equipment_source["metadata"]["artifacts"][0]["exists"])
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 92)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 2936677)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 1720347)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 1163603)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 52727)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 92)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 2976599)
        self.assertEqual(artifact["native"]["metrics"]["nativeRegisteredVoters"], 4837802)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutWarningRows"], 0)
        self.assertTrue(artifact["capabilities"]["historicalBaseline"])
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalRows"], 276)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        self.assertIn("official county-level presidential results", artifact["native"]["metrics"]["nativeHistoricalWarning"])
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 5253)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 5253)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "United States Senator")
        self.assertIn("MIT/OpenElections supplemental", artifact["native"]["metrics"]["nativeReviewSourceCoverage"])
        marion = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Marion County" and row["localUnit"] == "CN001")
        self.assertEqual(marion["coverageMode"], "presidentVsSenate")
        self.assertEqual(marion["harris"], 316)
        self.assertEqual(marion["trump"], 48)
        self.assertEqual(marion["comparisonDemVotes"], 309)
        self.assertEqual(marion["comparisonRepVotes"], 49)
    def test_iowa_clarity_detailxml_parser_builds_precinct_rows(self):
        config = load_config("etl/state-configs/ia.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeIowaClarityCountyDetailXmlDirectory")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 99)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 1663506)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 927019)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 707278)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 29209)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 1653)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 1653)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 1651)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "United States Representative")
        adair = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Adair County" and row["localUnit"] == "1NW")
        self.assertEqual(adair["coverageMode"], "presidentVsUSHouse")
        self.assertEqual(adair["harris"], 212)
        self.assertEqual(adair["trump"], 570)
        turnout = next(row for row in artifact["native"]["turnoutRows"] if row["county"] == "Adair County" and row["localUnit"] == "1NW")
        self.assertEqual(turnout["ballotsCast"], 802)
        self.assertEqual(turnout["registeredVoters"], 1060)
    def test_louisiana_sos_precinct_csv_parser_builds_house_review_rows(self):
        config = load_config("etl/state-configs/la.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeLouisianaSosPrecinctCsvDirectory")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 64)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 2006975)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 1208505)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 766870)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 31600)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 3885)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 3911)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparableComparisonRows"], 3119)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 64)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "United States Representative")
        acadia = next(row for row in artifact["native"]["resultRows"] if row["jurisdictionName"] == "Acadia Parish")
        self.assertEqual(acadia["votes"]["Harris"], 4695)
        self.assertEqual(acadia["votes"]["Trump"], 21783)
        first_review = next(
            row
            for row in artifact["native"]["reviewRows"]
            if row["county"] == "Acadia Parish" and row["localUnit"] == "Ward 01, Precinct 01"
        )
        self.assertEqual(first_review["coverageMode"], "presidentVsHouse")
        self.assertEqual(first_review["comparisonContest"], "U. S. Representative -- 3rd Congressional District")
        self.assertEqual(first_review["harris"], 58)
        self.assertEqual(first_review["trump"], 624)
    def test_west_virginia_clarity_detailxml_parser_builds_precinct_rows(self):
        config = load_config("etl/state-configs/wv.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeWestVirginiaClarityCountyDetailXmlDirectory")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 55)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 762390)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 533556)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 214309)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 14525)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 1648)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 1648)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 1649)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutBallotsCast"], 770587)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRegisteredVoters"], 1187991)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "United States Senator")
        barbour = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Barbour County" and row["localUnit"] == "PRECINCT 1")
        self.assertEqual(barbour["coverageMode"], "presidentVsSenate")
        self.assertEqual(barbour["harris"], 71)
        self.assertEqual(barbour["trump"], 401)
        turnout = next(row for row in artifact["native"]["turnoutRows"] if row["county"] == "Barbour County" and row["localUnit"] == "PRECINCT 1")
        self.assertEqual(turnout["ballotsCast"], 477)
        self.assertEqual(turnout["registeredVoters"], 797)
    def test_texas_county_json_parser_builds_county_rows_with_vtd_review(self):
        config = load_config("etl/state-configs/tx.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeTexasCountyJsonVtdReview")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 254)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 11388674)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 6393597)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 4835250)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 159827)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 9348)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 9346)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "United States Senator")
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewPresidentialVotes"], 11404528)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewCertifiedVoteGap"], -15854)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewVtdMinusCertifiedVotes"], 15854)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewTrumpVtdMinusCertified"], -194)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewHarrisVtdMinusCertified"], -116)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewOtherVtdMinusCertified"], 16164)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewNamedMinorVtdMinusCertified"], 3)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewGenericWriteInVotes"], 24730)
        self.assertEqual(artifact["native"]["metrics"]["nativeCertifiedDeclaredWriteInVotes"], 8569)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewGenericWriteInOverCertifiedDeclaredWriteIns"], 16161)
        self.assertIn("generic Write-In", artifact["native"]["metrics"]["nativeReviewWarning"])
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 9712)
        self.assertEqual(artifact["native"]["metrics"]["nativeRegisteredVoters"], 18686517)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 11460798)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalRows"], 762)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        self.assertEqual(len(artifact["native"]["historicalRows"]), 762)
        first_historical = artifact["native"]["historicalRows"][0]
        self.assertEqual(first_historical["jurisdictionName"], "Anderson County")
        self.assertEqual(first_historical["electionYear"], 2012)
        self.assertEqual(first_historical["demVotes"], 3813)
        self.assertEqual(first_historical["repVotes"], 12262)
        harris = next(
            row
            for row in artifact["native"]["reviewRows"]
            if row["county"] == "Harris County" and row["localUnit"] == "VTD 0001 (2010001; 4234)"
        )
        self.assertEqual(harris["coverageMode"], "presidentVsSenate")
        self.assertEqual(harris["harris"], 936)
        self.assertEqual(harris["trump"], 351)
        self.assertEqual(harris["comparisonDemVotes"], 947)
        turnout = next(
            row
            for row in artifact["native"]["turnoutRows"]
            if row["county"] == "Harris County" and row["localUnit"] == "VTD 0001 (2010001; 4234)"
        )
        self.assertEqual(turnout["ballotsCast"], 1324)
        self.assertEqual(turnout["registeredVoters"], 1672)
    def test_kentucky_general_recap_text_parser_builds_precinct_review_rows(self):
        config = load_config("etl/state-configs/ky.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeKentuckyGeneralRecapTextDirectory")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 120)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 2036111)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 1315523)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 691021)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 29567)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 3067)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 3067)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "United States Representative")
        self.assertEqual(artifact["native"]["metrics"]["nativeKentuckyMissingCountyTextRows"], [])
        elliott = next(row for row in artifact["native"]["resultRows"] if row["jurisdictionName"] == "Elliott County")
        self.assertEqual(elliott["votes"]["Trump"], 2335)
        self.assertEqual(elliott["votes"]["Harris"], 532)
        self.assertEqual(elliott["votes"]["Other"], 44)
        elliott_a101 = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Elliott County" and row["localUnit"] == "A101 Sandy Hook")
        self.assertEqual(elliott_a101["coverageMode"], "oneSidedHouseComparison")
        self.assertEqual(elliott_a101["harris"], 67)
        self.assertEqual(elliott_a101["trump"], 307)
        self.assertEqual(elliott_a101["comparisonDemVotes"], 0)
        self.assertEqual(elliott_a101["comparisonRepVotes"], 280)
        adair = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Adair County" and row["localUnit"] == "A102")
        self.assertEqual(adair["coverageMode"], "presidentVsHouse")
        self.assertEqual(adair["harris"], 18)
        self.assertEqual(adair["trump"], 298)
        self.assertEqual(adair["comparisonDemVotes"], 21)
        self.assertEqual(adair["comparisonRepVotes"], 284)
        campbell = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Campbell County" and row["localUnit"] == "A402")
        self.assertEqual(campbell["coverageMode"], "oneSidedHouseComparison")
        self.assertFalse(campbell["comparisonDemCandidatePresent"])
        self.assertTrue(campbell["comparisonRepCandidatePresent"])
        self.assertEqual(campbell["comparisonDemVotes"], 0)
        self.assertGreater(campbell["comparisonRepVotes"], 0)
        self.assertEqual(campbell["demDropoff"], 0)
        self.assertEqual(campbell["repDropoff"], 0)

    def test_new_hampshire_town_ward_csv_parser_builds_review_rows(self):
        config = load_config("etl/state-configs/nh.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeNewHampshireTownWardCsv")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 10)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 826189)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 395523)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 418488)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 12178)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 304)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 304)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "U.S. House")
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 304)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 831468)
        self.assertEqual(artifact["native"]["metrics"]["nativeRegisteredVoters"], 1013075)
        alton = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Belknap County" and row["localUnit"] == "Alton")
        self.assertEqual(alton["coverageMode"], "presidentVsHouseDistrict")
        self.assertEqual(alton["harris"], 1553)
        self.assertEqual(alton["trump"], 2645)
        self.assertEqual(alton["comparisonDemVotes"], 1611)
        self.assertEqual(alton["comparisonRepVotes"], 2555)
    def test_mississippi_election_recap_csv_parser_builds_county_rows(self):
        config = load_config("etl/state-configs/ms.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertTrue(any("ms-2024-november-active-voter-count" in warning for warning in report.warnings))
        active_voter_source = next(source for source in artifact["sources"] if source["id"] == "ms-2024-november-active-voter-count")
        self.assertEqual(active_voter_source["status"], "candidate")
        self.assertEqual(active_voter_source["parser"], "mississippiActiveVoterCountPdfToCsv")
        self.assertTrue(active_voter_source["metadata"]["artifacts"][0]["exists"])
        self.assertEqual(artifact["native"]["parser"], "nativeMississippiElectionRecapCsv")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 82)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 1225238)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 746305)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 465357)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 13576)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 82)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 82)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "United States Senate")
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 82)
        adams = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Adams County")
        self.assertEqual(adams["coverageMode"], "presidentVsSenate")
        self.assertEqual(adams["harris"], 6743)
        self.assertEqual(adams["trump"], 5081)
        self.assertEqual(adams["comparisonDemVotes"], 6560)
        self.assertEqual(adams["comparisonRepVotes"], 5219)
    def test_missouri_county_president_csv_parser_builds_county_rows(self):
        config = load_config("etl/state-configs/mo.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeMissouriCountyPresidentCsv")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 116)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 2995327)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 1751986)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 1200599)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 42742)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 116)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 116)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "United States Senator")
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 116)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 2995376)
        self.assertEqual(artifact["native"]["metrics"]["nativeRegisteredVoters"], 4433383)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalRows"], 348)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        boone_turnout = next(row for row in artifact["native"]["turnoutRows"] if row["county"] == "Boone County")
        self.assertEqual(boone_turnout["ballotsCast"], 90110)
        self.assertEqual(boone_turnout["registeredVoters"], 130901)
        boone_2020 = next(row for row in artifact["native"]["historicalRows"] if row["jurisdictionName"] == "Boone County" and row["electionYear"] == 2020)
        self.assertEqual(boone_2020["demVotes"], 50064)
        self.assertEqual(boone_2020["repVotes"], 38646)
        self.assertEqual(boone_2020["totalVotes"], 91130)
        boone = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Boone County")
        self.assertEqual(boone["coverageMode"], "presidentVsSenate")
        self.assertEqual(boone["harris"], 48452)
        self.assertEqual(boone["trump"], 39673)
        self.assertEqual(boone["comparisonDemVotes"], 49327)
        self.assertEqual(boone["comparisonRepVotes"], 37557)
    def test_montana_precinct_xlsx_parser_builds_precinct_review_rows(self):
        config = load_config("etl/state-configs/mt.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeMontanaPrecinctResultsXlsx")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 56)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 602963)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 352079)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 231906)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 18978)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 726)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 726)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "UNITED STATES SENATOR")
        self.assertEqual(artifact["native"]["metrics"]["nativeStatewideCertifiedVoteGap"], -27)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 56)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutWarningRows"], 56)
        self.assertTrue(all(row["warningRequired"] for row in artifact["native"]["turnoutRows"]))
        beaverhead = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Beaverhead County" and row["localUnit"] == "PRECINCT 01 - D-CITY (01)")
        self.assertEqual(beaverhead["coverageMode"], "presidentVsSenate")
        self.assertEqual(beaverhead["harris"], 170)
        self.assertEqual(beaverhead["trump"], 230)
        self.assertEqual(beaverhead["comparisonDemVotes"], 217)
        self.assertEqual(beaverhead["comparisonRepVotes"], 199)
    def test_nebraska_county_president_csv_parser_builds_county_rows(self):
        config = load_config("etl/state-configs/ne.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeNebraskaCountyPresidentCsv")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 93)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 952182)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 564816)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 369995)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 17371)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 93)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 93)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 93)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "United States Senator (Two Year Term)")
        douglas = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Douglas County")
        self.assertEqual(douglas["coverageMode"], "presidentVsSenate")
        self.assertEqual(douglas["harris"], 148733)
        self.assertEqual(douglas["trump"], 120919)
        self.assertEqual(douglas["comparisonDemVotes"], 142256)
        self.assertEqual(douglas["comparisonRepVotes"], 127726)
    def test_new_york_county_president_csv_parser_builds_county_rows(self):
        config = load_config("etl/state-configs/ny.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeNewYorkCountyPresidentCsv")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 62)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 8381429)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 3579519)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 4619543)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 182367)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 62)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 9753)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 9753)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "United States Senator")
        cayuga = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Cayuga County" and row["localUnit"] == "Auburn 8-1")
        self.assertEqual(cayuga["coverageMode"], "presidentVsSenate")
        self.assertEqual(cayuga["harris"], 413)
        self.assertEqual(cayuga["trump"], 432)
        self.assertEqual(cayuga["comparisonDemVotes"], 436)
        self.assertEqual(cayuga["comparisonRepVotes"], 378)
        delaware = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Delaware County" and row["localUnit"] == "AN 1")
        self.assertEqual(delaware["harris"], 305)
        self.assertEqual(delaware["trump"], 237)
        self.assertEqual(delaware["comparisonDemVotes"], 316)
        self.assertEqual(delaware["comparisonRepVotes"], 215)
        chemung = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Chemung County" and row["localUnit"] == "Town of Catlin LD: 01 01")
        self.assertEqual(chemung["harris"], 186)
        self.assertEqual(chemung["trump"], 423)
        self.assertEqual(chemung["comparisonDemVotes"], 193)
        self.assertEqual(chemung["comparisonRepVotes"], 401)
        fulton = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Fulton County" and row["localUnit"] == "City of Gloversville Ward 1")
        self.assertEqual(fulton["harris"], 293)
        self.assertEqual(fulton["trump"], 458)
        self.assertEqual(fulton["comparisonDemVotes"], 324)
        self.assertEqual(fulton["comparisonRepVotes"], 389)
        ulster = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Ulster County" and row["localUnit"] == "City of Kingston Ward 1-Dist. 1")
        self.assertEqual(ulster["harris"], 215)
        self.assertEqual(ulster["trump"], 112)
        self.assertEqual(ulster["comparisonDemVotes"], 209)
        self.assertEqual(ulster["comparisonRepVotes"], 104)
        albany = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Albany County" and row["localUnit"] == "ALBANY WARD 1 ED 1")
        self.assertEqual(albany["harris"], 121)
        self.assertEqual(albany["trump"], 40)
        self.assertEqual(albany["comparisonDemVotes"], 125)
        self.assertEqual(albany["comparisonRepVotes"], 33)
        allegany = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Allegany County" and row["localUnit"] == "Alfred 1")
        self.assertEqual(allegany["harris"], 399)
        self.assertEqual(allegany["trump"], 111)
        self.assertEqual(allegany["comparisonDemVotes"], 397)
        self.assertEqual(allegany["comparisonRepVotes"], 100)
        oneida = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Oneida County" and row["localUnit"] == "Annsville 1")
        self.assertEqual(oneida["harris"], 169)
        self.assertEqual(oneida["trump"], 624)
        self.assertEqual(oneida["comparisonDemVotes"], 178)
        self.assertEqual(oneida["comparisonRepVotes"], 559)
        onondaga = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Onondaga County" and row["localUnit"] == "CITY OF SYRACUSE")
        self.assertEqual(onondaga["harris"], 33894)
        self.assertEqual(onondaga["trump"], 10532)
        self.assertEqual(onondaga["comparisonDemVotes"], 33671)
        self.assertEqual(onondaga["comparisonRepVotes"], 9376)
        genesee = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Genesee County" and row["localUnit"] == "City of Batavia, Ward 1 1")
        self.assertEqual(genesee["harris"], 236)
        self.assertEqual(genesee["trump"], 277)
        self.assertEqual(genesee["comparisonDemVotes"], 247)
        self.assertEqual(genesee["comparisonRepVotes"], 258)
        tioga = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Tioga County" and row["localUnit"] == "Barton - 1")
        self.assertEqual(tioga["harris"], 254)
        self.assertEqual(tioga["trump"], 380)
        self.assertEqual(tioga["comparisonDemVotes"], 262)
        self.assertEqual(tioga["comparisonRepVotes"], 345)
        essex = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Essex County" and row["localUnit"] == "CHESTERFIELD 1")
        self.assertEqual(essex["harris"], 323)
        self.assertEqual(essex["trump"], 284)
        self.assertEqual(essex["comparisonDemVotes"], 339)
        self.assertEqual(essex["comparisonRepVotes"], 264)
        st_lawrence = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "St. Lawrence County" and row["localUnit"] == "Brasher 1")
        self.assertEqual(st_lawrence["harris"], 132)
        self.assertEqual(st_lawrence["trump"], 316)
        self.assertEqual(st_lawrence["comparisonDemVotes"], 162)
        self.assertEqual(st_lawrence["comparisonRepVotes"], 268)
        chenango = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Chenango County" and row["localUnit"] == "Norwich Ward 1")
        self.assertEqual(chenango["harris"], 302)
        self.assertEqual(chenango["trump"], 230)
        self.assertEqual(chenango["comparisonDemVotes"], 310)
        self.assertEqual(chenango["comparisonRepVotes"], 201)
        warren = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Warren County" and row["localUnit"] == "BOLTON")
        self.assertEqual(warren["harris"], 604)
        self.assertEqual(warren["trump"], 706)
        self.assertEqual(warren["comparisonDemVotes"], 632)
        self.assertEqual(warren["comparisonRepVotes"], 646)
        westchester = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Westchester County" and row["localUnit"] == "Town of Bedford - 1 10001")
        self.assertEqual(westchester["harris"], 235)
        self.assertEqual(westchester["trump"], 110)
        self.assertEqual(westchester["comparisonDemVotes"], 229)
        self.assertEqual(westchester["comparisonRepVotes"], 115)
        dutchess = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Dutchess County" and row["localUnit"] == "Amenia ED 1")
        self.assertEqual(dutchess["harris"], 457)
        self.assertEqual(dutchess["trump"], 462)
        self.assertEqual(dutchess["comparisonDemVotes"], 490)
        self.assertEqual(dutchess["comparisonRepVotes"], 409)
        dutchess_protected = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Dutchess County" and row["localUnit"] == "Beekman ED 16")
        self.assertEqual(dutchess_protected["harris"], 0)
        self.assertEqual(dutchess_protected["trump"], 1)
        self.assertEqual(dutchess_protected["comparisonDemVotes"], 0)
        self.assertEqual(dutchess_protected["comparisonRepVotes"], 1)
        lewis = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Lewis County" and row["localUnit"] == "Croghan 1")
        self.assertEqual(lewis["harris"], 207)
        self.assertEqual(lewis["trump"], 699)
        self.assertEqual(lewis["comparisonDemVotes"], 270)
        self.assertEqual(lewis["comparisonRepVotes"], 602)
        putnam = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Putnam County" and row["localUnit"] == "CA 01")
        self.assertEqual(putnam["harris"], 155)
        self.assertEqual(putnam["trump"], 232)
        self.assertEqual(putnam["comparisonDemVotes"], 170)
        self.assertEqual(putnam["comparisonRepVotes"], 209)
        suffolk = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Suffolk County" and row["localUnit"] == "Shelter Island ED 001")
        self.assertEqual(suffolk["harris"], 372)
        self.assertEqual(suffolk["trump"], 179)
        self.assertEqual(suffolk["comparisonDemVotes"], 376)
        self.assertEqual(suffolk["comparisonRepVotes"], 176)
        broome = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Broome County" and row["localUnit"] == "City Binghamton 1")
        self.assertEqual(broome["harris"], 237)
        self.assertEqual(broome["trump"], 127)
        self.assertEqual(broome["comparisonDemVotes"], 243)
        self.assertEqual(broome["comparisonRepVotes"], 110)
        cortland = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Cortland County" and row["localUnit"] == "L.D. 1 Ward 1 ED 1")
        self.assertEqual(cortland["harris"], 433)
        self.assertEqual(cortland["trump"], 249)
        self.assertEqual(cortland["comparisonDemVotes"], 435)
        self.assertEqual(cortland["comparisonRepVotes"], 240)
        washington = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Washington County" and row["localUnit"] == "Argyle District 1")
        self.assertEqual(washington["harris"], 178)
        self.assertEqual(washington["trump"], 433)
        self.assertEqual(washington["comparisonDemVotes"], 211)
        self.assertEqual(washington["comparisonRepVotes"], 381)
        cattaraugus = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Cattaraugus County" and row["localUnit"] == "Allegany District 1")
        self.assertEqual(cattaraugus["harris"], 413)
        self.assertEqual(cattaraugus["trump"], 435)
        self.assertEqual(cattaraugus["comparisonDemVotes"], 413)
        self.assertEqual(cattaraugus["comparisonRepVotes"], 403)
    def test_california_county_president_csv_parser_builds_county_rows_and_history(self):
        config = load_config("etl/state-configs/ca.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeCaliforniaCountyPresidentCsv")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 58)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 15865475)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 6081697)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 9276179)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 507599)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 58)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 58)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 58)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "United States Senator (Full Term)")
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalRows"], 174)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        los_angeles = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Los Angeles County")
        self.assertEqual(los_angeles["coverageMode"], "presidentVsSenate")
        self.assertEqual(los_angeles["harris"], 2417109)
        self.assertEqual(los_angeles["trump"], 1189862)
        self.assertEqual(los_angeles["comparisonDemVotes"], 2335222)
        self.assertEqual(los_angeles["comparisonRepVotes"], 1220750)

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
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 1057)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 1057)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "United States Senator")
        self.assertIn("Clark County, Washoe County, and Humboldt County official CVR precinct rows", artifact["native"]["metrics"]["nativeReviewSourceCoverage"])
        clark_precinct = next(row for row in artifact["native"]["reviewRows"] if row["localUnit"] == "1000 (1000|00)")
        self.assertEqual(clark_precinct["county"], "Clark County")
        self.assertEqual(clark_precinct["coverageMode"], "presidentVsSenate")
        self.assertEqual(clark_precinct["harris"], 286)
        self.assertEqual(clark_precinct["trump"], 357)
        self.assertEqual(clark_precinct["comparisonDemVotes"], 283)
        self.assertEqual(clark_precinct["comparisonRepVotes"], 319)
        washoe_precinct = next(row for row in artifact["native"]["reviewRows"] if row["localUnit"] == "100000.1 (16100001)")
        self.assertEqual(washoe_precinct["county"], "Washoe County")
        self.assertEqual(washoe_precinct["sourceId"], "nv-washoe-2024-cvr-precinct-review")
        self.assertEqual(washoe_precinct["harris"], 663)
        self.assertEqual(washoe_precinct["trump"], 262)
        self.assertEqual(washoe_precinct["comparisonDemVotes"], 658)
        self.assertEqual(washoe_precinct["comparisonRepVotes"], 248)
        humboldt_precinct = next(row for row in artifact["native"]["reviewRows"] if row["localUnit"] == "01.00 (08000100)")
        self.assertEqual(humboldt_precinct["county"], "Humboldt County")
        self.assertEqual(humboldt_precinct["sourceId"], "nv-humboldt-2024-cvr-precinct-review")
        self.assertEqual(humboldt_precinct["harris"], 180)
        self.assertEqual(humboldt_precinct["trump"], 535)
        self.assertEqual(humboldt_precinct["comparisonDemVotes"], 188)
        self.assertEqual(humboldt_precinct["comparisonRepVotes"], 464)
        self.assertTrue(any(source["id"] == "nv-2024-source-coverage-inventory" for source in artifact["sources"]))
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalRows"], 51)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        self.assertEqual(artifact["native"]["historicalRows"][0]["jurisdictionName"], "Carson City")

    def test_florida_detail_html_parser_builds_county_rows(self):
        config = load_config("etl/state-configs/fl.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeFloridaDetailHtml")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 67)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 10893752)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 6110125)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 4683038)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 100589)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 67)
        self.assertEqual(artifact["native"]["metrics"]["nativeRegisteredVoters"], 15740083)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 10999125)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 67)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 67)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "United States Senator")
        self.assertEqual(artifact["native"]["metrics"]["nativeExtractRows"], 3321)
        self.assertEqual(artifact["native"]["metrics"]["nativeExtractRaceCount"], 40)
        self.assertEqual(artifact["native"]["metrics"]["nativeExtractPresidentRows"], 603)
        self.assertEqual(artifact["native"]["metrics"]["nativeExtractSenateRows"], 402)
        self.assertEqual(artifact["native"]["metrics"]["nativeExtractCountyCount"], 67)
        self.assertTrue(artifact["native"]["metrics"]["nativeExtractVerificationPassed"])
        self.assertTrue(artifact["native"]["metrics"]["nativeCountyDistributionAnalysis"])
        self.assertTrue(any(row["coverageMode"] == "presidentVsSenate" for row in artifact["native"]["reviewRows"]))
        alachua = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Alachua County")
        self.assertEqual(alachua["comparisonDemVotes"], 78314)
        self.assertEqual(alachua["comparisonRepVotes"], 54458)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalRows"], 201)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        self.assertEqual(artifact["native"]["historicalRows"][0]["jurisdictionName"], "Alachua County")

    def test_virginia_election_stats_csv_parser_builds_locality_and_precinct_rows(self):
        config = load_config("etl/state-configs/va.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeVirginiaElectionStatsContestCsv")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 133)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 4505941)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 2075085)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 2335395)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 95461)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 2669)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 2669)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "Member, United States Senate")
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewPresidentialVotes"], 4505941)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 2669)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 4537976)
        self.assertEqual(artifact["native"]["metrics"]["nativeRegisteredVoters"], 6434637)
        self.assertTrue(all(row["coverageMode"] == "presidentVsSenate" for row in artifact["native"]["reviewRows"]))

        chincoteague = next(
            row
            for row in artifact["native"]["reviewRows"]
            if row["county"] == "Accomack County" and row["localUnit"] == "101 - Chincoteague"
        )
        self.assertEqual(chincoteague["harris"], 776)
        self.assertEqual(chincoteague["trump"], 1406)
        self.assertEqual(chincoteague["totalVotes"], 2199)
        self.assertEqual(chincoteague["comparisonDemVotes"], 831)
        self.assertEqual(chincoteague["comparisonRepVotes"], 1340)
        self.assertEqual(chincoteague["comparisonOtherVotes"], 4)
        self.assertEqual(chincoteague["demDropoff"], -2.5011)
        self.assertEqual(chincoteague["repDropoff"], 3.0014)

        turnout = next(
            row
            for row in artifact["native"]["turnoutRows"]
            if row["county"] == "Accomack County" and row["localUnit"] == "101 - Chincoteague"
        )
        self.assertEqual(turnout["ballotsCast"], 2266)
        self.assertEqual(turnout["registeredVoters"], 3129)

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
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 2684)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparableComparisonRows"], 2637)
        self.assertEqual(artifact["native"]["metrics"]["nativeOneSidedComparisonRows"], 8)
        self.assertEqual(artifact["native"]["metrics"]["nativeMultiDistrictComparisonRows"], 39)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "U.S. House")
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewZeroTotalRowsOmitted"], 17)
        self.assertEqual(artifact["native"]["metrics"]["nativeStatewideCertifiedVoteGap"], 19)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 159)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalRows"], 477)
        self.assertEqual(artifact["native"]["metrics"]["nativeHistoricalYears"], [2012, 2016, 2020])
        self.assertEqual(len(artifact["native"]["historicalRows"]), 477)
        appling_2020 = next(row for row in artifact["native"]["historicalRows"] if row["electionYear"] == 2020 and row["jurisdictionName"] == "Appling County")
        self.assertEqual(appling_2020["repVotes"], 6526)
        self.assertEqual(appling_2020["demVotes"], 1779)
        appling = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Appling County" and row["localUnit"] == "1B")
        self.assertEqual(appling["coverageMode"], "presidentVsUSHouse")
        self.assertEqual(appling["comparisonContest"], "US House of Representatives - District 1")
        self.assertEqual(appling["comparisonDemVotes"], 97)
        self.assertEqual(appling["comparisonRepVotes"], 895)
        candler = next(row for row in artifact["native"]["reviewRows"] if row["county"] == "Candler County" and row["localUnit"] == "Jack Strickland Community Center (CAND)")
        self.assertEqual(candler["coverageMode"], "oneSidedHouseComparison")
        self.assertFalse(candler["comparisonDemCandidatePresent"])
        self.assertTrue(candler["comparisonRepCandidatePresent"])
        multi_district = next(row for row in artifact["native"]["reviewRows"] if row["coverageMode"] == "multiDistrictHouseComparison")
        self.assertGreater(len(multi_district["comparisonContests"]), 1)
        self.assertEqual(multi_district["demDropoff"], 0)
        self.assertEqual(multi_district["repDropoff"], 0)

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
        write_xlsx_workbook(
            precinct,
            {
                "President and Vice President": [
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
                "U.S. Congress": [
                    ["Title"],
                    [
                        "County Name",
                        "Precinct Name",
                        "Precinct Code",
                        "Registered Voters",
                        "Ballots Counted",
                        "Sherrod Brown (D)",
                        "Don Kissick (L)",
                        "Bernie Moreno (R)",
                    ],
                    ["Total", "", "", 300, 170, 75, 7, 82],
                    [""],
                    ["Alpha", "Precinct 1", "001", 100, 60, 30, 2, 18],
                    ["Beta", "Precinct 2", "002", 200, 110, 45, 5, 64],
                ],
            },
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
                        "format": "ohioPrecinctPresidentVsSenate",
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
                    "comparisonContest": {
                        "label": "United States Senator",
                        "sourceId": "precinct",
                        "sheetName": "U.S. Congress",
                        "headerRow": 2,
                        "dataStartRow": 5,
                        "majorCandidates": {
                            "dem": {"candidateContains": "Sherrod Brown"},
                            "rep": {"candidateContains": "Bernie Moreno"},
                        },
                        "otherCandidates": [
                            {"key": "kissick", "label": "Don Kissick (L)", "candidateContains": "Don Kissick"}
                        ],
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
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 2)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "United States Senator")
        self.assertEqual(artifact["native"]["resultRows"][0]["jurisdictionName"], "Alpha County")
        alpha = artifact["native"]["reviewRows"][0]
        self.assertEqual(alpha["coverageMode"], "presidentVsSenate")
        self.assertEqual(alpha["comparisonContest"], "United States Senator")
        self.assertEqual(alpha["comparisonDemVotes"], 30)
        self.assertEqual(alpha["comparisonRepVotes"], 18)
        self.assertAlmostEqual(alpha["demDropoff"], 8.3333)
        self.assertAlmostEqual(alpha["repDropoff"], 3.3333)

    def test_kansas_presidential_house_xlsx_parser_builds_precinct_review_rows(self):
        config = load_config("etl/state-configs/ks.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertEqual(native["parser"], "nativeKansasPresidentialHouseXlsx")
        self.assertEqual(len(native["resultRows"]), 105)
        self.assertEqual(len(native["reviewRows"]), 3739)
        self.assertEqual(len(native["turnoutRows"]), 105)
        self.assertEqual(native["metrics"]["nativeResultTotalVotes"], 1327591)
        self.assertEqual(native["metrics"]["nativeTrumpVotes"], 758802)
        self.assertEqual(native["metrics"]["nativeHarrisVotes"], 544853)
        self.assertEqual(native["metrics"]["nativeOtherVotes"], 23936)
        self.assertEqual(native["metrics"]["nativeComparisonRows"], 3736)

        johnson = next(
            row
            for row in native["reviewRows"]
            if row["county"] == "Johnson County" and row["localUnit"] == "Aubry Township Precinct 01"
        )
        self.assertEqual(johnson["coverageMode"], "presidentVsUSHouse")
        self.assertEqual(johnson["comparisonDemVotes"], 63)
        self.assertEqual(johnson["comparisonRepVotes"], 82)
        self.assertAlmostEqual(johnson["repDropoff"], 6.4103)
        self.assertEqual(
            sum(1 for row in native["reviewRows"] if row["coverageMode"] == "voteShareOnly"),
            3,
        )

    def test_idaho_county_president_csv_builds_results_with_county_review_rows(self):
        config = load_config("etl/state-configs/id.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertEqual(native["parser"], "nativeIdahoCountyPresidentCsv")
        self.assertEqual(len(native["resultRows"]), 44)
        self.assertEqual(len(native["reviewRows"]), 44)
        self.assertEqual(len(native["turnoutRows"]), 44)
        self.assertEqual(native["metrics"]["nativeResultTotalVotes"], 904967)
        self.assertEqual(native["metrics"]["nativeTrumpVotes"], 605246)
        self.assertEqual(native["metrics"]["nativeHarrisVotes"], 274972)
        self.assertEqual(native["metrics"]["nativeOtherVotes"], 24749)
        self.assertEqual(native["metrics"]["nativeComparisonRows"], 44)
        self.assertEqual(native["metrics"]["nativeComparisonContest"], "United States Representative")
        self.assertIn("county-level President-versus-U.S. House", native["metrics"]["nativeReviewWarning"])
        ada = next(row for row in native["resultRows"] if row["jurisdictionName"] == "Ada County")
        self.assertEqual(ada["votes"], {"Trump": 143759, "Harris": 116116, "Other": 7544})
        ada_review = next(row for row in native["reviewRows"] if row["county"] == "Ada County")
        self.assertEqual(ada_review["coverageMode"], "presidentVsUSHouse")
        self.assertEqual(ada_review["comparisonDemVotes"], 103820)
        self.assertEqual(ada_review["comparisonRepVotes"], 142602)
        self.assertEqual(ada_review["comparisonOtherVotes"], 12767)

    def test_native_payload_appends_generic_historical_csv_rows(self):
        tmp = self.fixture_dir("generic-historical-wrapper")
        result_path = tmp / "id-results.csv"
        historical_path = tmp / "id-historical.csv"
        config_path = tmp / "id.json"
        result_path.write_text(
            "\n".join(
                [
                    "state,election_year,jurisdiction_name,trump,harris,other",
                    "ID,2024,Ada,30,20,5",
                    "ID,2024,Boise,30,15,0",
                ]
            )
            + "\n",
            encoding="utf-8",
        )
        historical_path.write_text(
            "\n".join(
                [
                    "state,election_year,jurisdiction_name,source_id,source_level,row_method,dem_votes,rep_votes,other_votes,total_votes,source_url",
                    "ID,2020,Ada,id-historical,county,fixture,100,120,5,225,https://example.test/id",
                    "ID,2020,Boise,id-historical,county,fixture,80,90,3,173,https://example.test/id",
                ]
            )
            + "\n",
            encoding="utf-8",
        )
        config_path.write_text(
            json.dumps(
                {
                    "code": "ID",
                    "name": "Idaho",
                    "authority": "Idaho Secretary of State",
                    "electionYear": 2024,
                    "office": "President",
                    "sources": [
                        {
                            "id": "id-results",
                            "category": "Fixture results",
                            "url": "https://example.test/id-results",
                            "localFile": result_path.as_posix(),
                            "parser": "countyPresidentCsv",
                            "authority": "Fixture",
                            "timestampBasis": "Fixture",
                            "confidence": "Fixture",
                            "status": "loaded",
                        },
                        {
                            "id": "id-historical",
                            "category": "Fixture historical baseline",
                            "url": "https://example.test/id-historical",
                            "localFile": historical_path.as_posix(),
                            "parser": "historicalPresidentialCsv",
                            "authority": "Fixture",
                            "timestampBasis": "Fixture",
                            "confidence": "Fixture",
                            "status": "loaded",
                        },
                    ],
                    "expected": {
                        "jurisdictions": 2,
                        "resultRows": 2,
                        "sources": 2,
                        "stateTotal": 100,
                        "trump": 60,
                        "harris": 35,
                        "other": 5,
                        "reviewRows": 0,
                        "turnoutRows": 0,
                        "historicalBaselineRows": 2,
                    },
                    "capabilities": {
                        "sourcePlanner": True,
                        "certifiedResults": True,
                        "map": False,
                        "reviewGraphs": False,
                        "turnout": False,
                        "historicalBaseline": True,
                    },
                    "certifiedResults": {
                        "format": "countyPresidentCsv",
                        "sourceId": "id-results",
                        "otherColumns": ["other"],
                    },
                    "historicalBaselines": {
                        "format": "historicalPresidentialCsv",
                        "sourceId": "id-historical",
                        "expected": {"rowCount": 2, "years": [2020]},
                    },
                }
            ),
            encoding="utf-8",
        )

        config = load_config(config_path)
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)
        native = artifact["native"]

        self.assertTrue(report.passed)
        self.assertEqual(native["parser"], "nativeIdahoCountyPresidentCsv")
        self.assertEqual(native["metrics"]["nativeHistoricalRows"], 2)
        self.assertEqual(native["metrics"]["nativeHistoricalYears"], [2020])
        self.assertEqual(len(native["historicalRows"]), 2)
        self.assertEqual(native["historicalRows"][0]["jurisdictionName"], "Ada County")
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
                    "AZ,2024,Cache County,county,-99,300,EAC-reported registered-voter denominator,false,https://www.eac.gov/research-and-data/studies-and-reports",
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
                            "rowCount": 3,
                            "ballotsCast": 300,
                            "registeredVoters": 550,
                        },
                    },
                    "expected": {
                        "jurisdictions": 0,
                        "resultRows": 0,
                        "sources": 1,
                        "reviewRows": 0,
                        "turnoutRows": 3,
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
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 3)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 300)
        self.assertEqual(artifact["native"]["turnoutRows"][0]["turnoutPct"], 80)
        self.assertTrue(artifact["native"]["turnoutRows"][1]["warningRequired"])
        sentinel_row = artifact["native"]["turnoutRows"][2]
        self.assertEqual(sentinel_row["ballotsCast"], 0)
        self.assertIsNone(sentinel_row["turnoutPct"])
        self.assertTrue(sentinel_row["warningRequired"])

    def test_maryland_precinct_csv_parser_builds_precinct_review_rows(self):
        config = load_config("etl/state-configs/md.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeMarylandPrecinctCsv")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 24)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 3038334)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 1035550)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 1902577)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 100207)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 1958)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 1958)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "U.S. Senator")
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 24)
        self.assertEqual(artifact["native"]["metrics"]["nativePresidentialModeVotes"]["Mail-In Ballot 1 Votes"], 508880)
        self.assertEqual(artifact["native"]["metrics"]["nativePresidentialModeVotes"]["Mail-In Ballot 2 Votes"], 243709)

        allegany = next(
            row
            for row in artifact["native"]["reviewRows"]
            if row["county"] == "Allegany County" and row["localUnit"] == "001-000"
        )
        self.assertEqual(allegany["coverageMode"], "presidentVsSenate")
        self.assertEqual(allegany["harris"], 72)
        self.assertEqual(allegany["trump"], 420)
        self.assertEqual(allegany["totalVotes"], 500)
        self.assertEqual(allegany["comparisonDemVotes"], 57)
        self.assertEqual(allegany["comparisonRepVotes"], 413)
        self.assertEqual(allegany["demDropoff"], 3.0)
        self.assertEqual(allegany["repDropoff"], 1.4)
    def test_south_carolina_election_history_parser_builds_precinct_review_rows(self):
        config = load_config("etl/state-configs/sc.json")
        report = validate_config(config)
        artifact = build_staging_artifact(config, report)

        self.assertTrue(report.passed)
        self.assertEqual(artifact["native"]["parser"], "nativeSouthCarolinaElectionHistoryCsv")
        self.assertEqual(artifact["native"]["metrics"]["nativeResultRows"], 46)
        self.assertEqual(artifact["native"]["metrics"]["nativeResultTotalVotes"], 2548140)
        self.assertEqual(artifact["native"]["metrics"]["nativeTrumpVotes"], 1483747)
        self.assertEqual(artifact["native"]["metrics"]["nativeHarrisVotes"], 1028452)
        self.assertEqual(artifact["native"]["metrics"]["nativeOtherVotes"], 35941)
        self.assertEqual(artifact["native"]["metrics"]["nativeReviewRows"], 2401)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonRows"], 2400)
        self.assertEqual(artifact["native"]["metrics"]["nativeMissingComparisonRows"], 1)
        self.assertEqual(artifact["native"]["metrics"]["nativePresidentialPrecinctRows"], 2446)
        self.assertEqual(artifact["native"]["metrics"]["nativeZeroPresidentialPrecinctRows"], 45)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonPrecinctRows"], 2491)
        self.assertEqual(artifact["native"]["metrics"]["nativeDuplicateComparisonRows"], 45)
        self.assertEqual(artifact["native"]["metrics"]["nativeComparisonContest"], "United States House")
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutRows"], 46)
        self.assertEqual(artifact["native"]["metrics"]["nativeRegisteredVoters"], 3851930)
        self.assertEqual(artifact["native"]["metrics"]["nativeBallotsCast"], 2553185)
        self.assertEqual(artifact["native"]["metrics"]["nativeTurnoutWarningRows"], 46)
        self.assertTrue(all(row["warningRequired"] for row in artifact["native"]["turnoutRows"]))

        abbeville = next(
            row
            for row in artifact["native"]["reviewRows"]
            if row["county"] == "Abbeville County" and row["localUnit"] == "Abbeville No. 01"
        )
        self.assertEqual(abbeville["coverageMode"], "presidentVsUSHouse")
        self.assertEqual(abbeville["harris"], 354)
        self.assertEqual(abbeville["trump"], 923)
        self.assertEqual(abbeville["totalVotes"], 1292)
        self.assertEqual(abbeville["comparisonDemVotes"], 311)
        self.assertEqual(abbeville["comparisonRepVotes"], 877)
        self.assertEqual(abbeville["comparisonOtherVotes"], 81)
        self.assertEqual(abbeville["demDropoff"], 3.3282)
        self.assertEqual(abbeville["repDropoff"], 3.5604)

        failsafe = next(
            row
            for row in artifact["native"]["reviewRows"]
            if row["county"] == "Bamberg County" and row["localUnit"] == "Failsafe Provisional"
        )
        self.assertEqual(failsafe["coverageMode"], "voteShareOnly")
        self.assertEqual(failsafe["harris"], 1)
        self.assertEqual(failsafe["comparisonDemVotes"], 0)
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
        for state in ["ak", "az", "ga", "mi", "mn", "nc", "nv", "oh", "pa", "sc", "wa", "wi", "wy"]:
            self.assertTrue((tmp / f"{state}-2024-staging.json").exists())


if __name__ == "__main__":
    unittest.main()
