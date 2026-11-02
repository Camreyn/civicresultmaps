// Only current pages linked by the NYSBOE voting-technology hub establish these lists.
export const equipmentSources = [
  { id: "clear-ballot", title: "Clear Ballot", url: "https://elections.ny.gov/clear-ballot", heading: "Clear Ballot Counties", family: "Clear Ballot / ClearVote", expected: 17 },
  { id: "liberty-vote", title: "Liberty Vote", url: "https://elections.ny.gov/liberty-vote", heading: "Liberty Vote Counties", family: "Liberty Vote / Democracy Suite (formerly Dominion)", expected: 27 },
  { id: "ess", title: "Election Systems & Software (ES&S)", url: "https://elections.ny.gov/election-systems-software-ess", heading: "ES&S Counties", family: "Election Systems & Software (ES&S)", expected: 11 },
  { id: "hart-verity", title: "Hart Verity", url: "https://elections.ny.gov/hart-verity", heading: "Hart Verity Counties", family: "Hart / Verity", expected: 7 },
];

export const contextSources = [
  { id: "election-information", title: "2026 election information", url: "https://elections.ny.gov/election-information" },
  { id: "voting-technology", title: "Voting technology hub", url: "https://elections.ny.gov/voting-technology" },
  { id: "legacy-ess", title: "Legacy ES&S AutoMARK page (conflicting Nassau listing)", url: "https://elections.ny.gov/node/276" },
];
