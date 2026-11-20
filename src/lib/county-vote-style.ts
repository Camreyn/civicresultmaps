import type { CountyVote } from "./county-vote-races";

export const palette = {
  dem: ["#779bfd", "#4e71cd", "#344f9d"],
  rep: ["#f3857b", "#c05d58", "#973f42"],
  neutral: ["#e3be72", "#b79552", "#8a713f"],
  missing: ["#515966", "", ""],
};
const shades = {
  dem: [["#acbff7","#819bd9","#6076b8"],palette.dem,["#597fe4","#4264bd","#304b96"],["#446cd8","#3758ab","#253e85"]],
  rep: [["#f5b4ad","#d58b85","#af6c69"],palette.rep,["#e86560","#bc504e","#934045"],["#d94c49","#b44040","#8b3339"]],
};

export function countyVoteColors(vote: CountyVote | null) {
  const party = vote?.color;
  const tone = Math.max(0, Math.min(3, Math.floor(((vote?.leadShare ?? .60) - .50) * 10)));
  return party === "dem" || party === "rep" ? shades[party][tone] : palette[party ?? "missing"];
}
