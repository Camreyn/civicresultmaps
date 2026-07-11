export const states = [
  { code: "AK", name: "Alaska", fips: "02" },
  { code: "AL", name: "Alabama", fips: "01" },
  { code: "AR", name: "Arkansas", fips: "05" },
  { code: "AZ", name: "Arizona", fips: "04", priority: "swing" },
  { code: "CA", name: "California", fips: "06" },
  { code: "CO", name: "Colorado", fips: "08" },
  { code: "CT", name: "Connecticut", fips: "09" },
  { code: "DC", name: "District of Columbia", fips: "11" },
  { code: "DE", name: "Delaware", fips: "10" },
  { code: "FL", name: "Florida", fips: "12" },
  { code: "GA", name: "Georgia", fips: "13", priority: "swing" },
  { code: "HI", name: "Hawaii", fips: "15" },
  { code: "IA", name: "Iowa", fips: "19" },
  { code: "ID", name: "Idaho", fips: "16" },
  { code: "IL", name: "Illinois", fips: "17" },
  { code: "IN", name: "Indiana", fips: "18" },
  { code: "KS", name: "Kansas", fips: "20" },
  { code: "KY", name: "Kentucky", fips: "21" },
  { code: "LA", name: "Louisiana", fips: "22" },
  { code: "MA", name: "Massachusetts", fips: "25" },
  { code: "MD", name: "Maryland", fips: "24" },
  { code: "ME", name: "Maine", fips: "23" },
  { code: "MI", name: "Michigan", fips: "26", priority: "swing" },
  { code: "MN", name: "Minnesota", fips: "27" },
  { code: "MO", name: "Missouri", fips: "29" },
  { code: "MS", name: "Mississippi", fips: "28" },
  { code: "MT", name: "Montana", fips: "30" },
  { code: "NC", name: "North Carolina", fips: "37", priority: "swing" },
  { code: "ND", name: "North Dakota", fips: "38" },
  { code: "NE", name: "Nebraska", fips: "31" },
  { code: "NH", name: "New Hampshire", fips: "33" },
  { code: "NJ", name: "New Jersey", fips: "34" },
  { code: "NM", name: "New Mexico", fips: "35" },
  { code: "NV", name: "Nevada", fips: "32", priority: "swing" },
  { code: "NY", name: "New York", fips: "36" },
  { code: "OH", name: "Ohio", fips: "39" },
  { code: "OK", name: "Oklahoma", fips: "40" },
  { code: "OR", name: "Oregon", fips: "41" },
  { code: "PA", name: "Pennsylvania", fips: "42", priority: "swing" },
  { code: "RI", name: "Rhode Island", fips: "44" },
  { code: "SC", name: "South Carolina", fips: "45" },
  { code: "SD", name: "South Dakota", fips: "46" },
  { code: "TN", name: "Tennessee", fips: "47" },
  { code: "TX", name: "Texas", fips: "48" },
  { code: "UT", name: "Utah", fips: "49" },
  { code: "VA", name: "Virginia", fips: "51" },
  { code: "VT", name: "Vermont", fips: "50" },
  { code: "WA", name: "Washington", fips: "53" },
  { code: "WI", name: "Wisconsin", fips: "55", priority: "swing" },
  { code: "WV", name: "West Virginia", fips: "54" },
  { code: "WY", name: "Wyoming", fips: "56" },
];

export const stateByCode = new Map(states.map((state) => [state.code, state]));

export function stateCodes() {
  return states.map((state) => state.code);
}

export function requireState(code) {
  const state = stateByCode.get(String(code).toUpperCase());
  if (!state) {
    throw new Error(`Unsupported state code: ${code}`);
  }
  return state;
}
