import swingStateParity from "../../data/swing-state-2024-parity-status.json";

export type SwingStateParityPackage = typeof swingStateParity;
export type SwingStateParityState = SwingStateParityPackage["states"][number];

type SwingStateParityFilters = {
  state?: string;
};

export function listSwingStateParity(input: SwingStateParityFilters = {}) {
  const requestedState = input.state?.toUpperCase();
  const states = swingStateParity.states.filter((entry) => !requestedState || entry.state === requestedState);

  return {
    benchmarkState: swingStateParity.benchmarkState,
    electionYear: swingStateParity.electionYear,
    generatedAt: swingStateParity.generatedAt,
    policy: swingStateParity.policy,
    purpose: swingStateParity.purpose,
    states,
    summary: {
      ...swingStateParity.summary,
      returnedStates: states.length,
    },
    swingStates: swingStateParity.swingStates,
  };
}
