// Content for the #network drill-down graph. Data only — the behaviour lives in
// js/network-graph.js.
//
// `parents` is an array on purpose: a node can sit under more than one topic
// (e.g. "Equilibrium" is reached from both ECON 201 and CHEM 204). The graph
// only ever creates one copy of a node; opening a second parent just pulls a
// new edge to the node that's already on the map.
//
// kind: 'root'   — the single anchor node, pinned to the centre
//       'course' — shown (with the root) on first load
//       'topic'  — has children of its own
//       'leaf'   — nothing further to open
window.GRAPH_NODES = [
  { id: 'cohort', label: 'Your cohort', kind: 'root' },

  // Courses
  { id: 'econ201', label: 'ECON 201', kind: 'course', parents: ['cohort'] },
  { id: 'bio110', label: 'BIO 110', kind: 'course', parents: ['cohort'] },
  { id: 'chem204', label: 'CHEM 204', kind: 'course', parents: ['cohort'] },
  { id: 'psyc101', label: 'PSYC 101', kind: 'course', parents: ['cohort'] },

  // ECON 201
  { id: 'market-structures', label: 'Market structures', kind: 'topic', parents: ['econ201'] },
  { id: 'elasticity', label: 'Elasticity', kind: 'topic', parents: ['econ201'] },
  { id: 'equilibrium', label: 'Equilibrium', kind: 'topic', parents: ['econ201', 'chem204'] },
  { id: 'monopoly', label: 'Monopoly', kind: 'topic', parents: ['market-structures'] },
  { id: 'oligopoly', label: 'Oligopoly', kind: 'topic', parents: ['market-structures'] },
  { id: 'perfect-competition', label: 'Perfect competition', kind: 'leaf', parents: ['market-structures'] },
  { id: 'price-discrimination', label: 'Price discrimination', kind: 'leaf', parents: ['monopoly', 'oligopoly'] },
  { id: 'deadweight-loss', label: 'Deadweight loss', kind: 'leaf', parents: ['monopoly'] },
  { id: 'game-theory', label: 'Game theory', kind: 'topic', parents: ['oligopoly'] },
  { id: 'nash-equilibrium', label: 'Nash equilibrium', kind: 'leaf', parents: ['game-theory', 'equilibrium'] },
  { id: 'prisoners-dilemma', label: "Prisoner's dilemma", kind: 'leaf', parents: ['game-theory'] },
  { id: 'price-elasticity', label: 'Price elasticity', kind: 'leaf', parents: ['elasticity'] },
  { id: 'income-elasticity', label: 'Income elasticity', kind: 'leaf', parents: ['elasticity'] },
  { id: 'supply-shocks', label: 'Supply shocks', kind: 'leaf', parents: ['equilibrium'] },

  // CHEM 204
  { id: 'reaction-kinetics', label: 'Reaction kinetics', kind: 'topic', parents: ['chem204'] },
  { id: 'thermodynamics', label: 'Thermodynamics', kind: 'topic', parents: ['chem204'] },
  { id: 'le-chatelier', label: "Le Chatelier's principle", kind: 'leaf', parents: ['equilibrium'] },
  { id: 'rate-laws', label: 'Rate laws', kind: 'leaf', parents: ['reaction-kinetics'] },
  { id: 'activation-energy', label: 'Activation energy', kind: 'leaf', parents: ['reaction-kinetics', 'enzymes'] },
  { id: 'enzymes', label: 'Enzymes', kind: 'topic', parents: ['reaction-kinetics', 'metabolism'] },
  { id: 'active-sites', label: 'Active sites', kind: 'leaf', parents: ['enzymes'] },
  { id: 'gibbs-free-energy', label: 'Gibbs free energy', kind: 'leaf', parents: ['thermodynamics'] },
  { id: 'entropy', label: 'Entropy', kind: 'leaf', parents: ['thermodynamics'] },

  // BIO 110
  { id: 'cell-biology', label: 'Cell biology', kind: 'topic', parents: ['bio110'] },
  { id: 'metabolism', label: 'Metabolism', kind: 'topic', parents: ['bio110'] },
  { id: 'genetics', label: 'Genetics', kind: 'topic', parents: ['bio110'] },
  { id: 'mitochondria', label: 'Mitochondria', kind: 'topic', parents: ['cell-biology'] },
  { id: 'cell-membrane', label: 'Cell membrane', kind: 'leaf', parents: ['cell-biology'] },
  { id: 'cellular-respiration', label: 'Cellular respiration', kind: 'topic', parents: ['mitochondria', 'metabolism'] },
  { id: 'photosynthesis', label: 'Photosynthesis', kind: 'topic', parents: ['metabolism'] },
  { id: 'atp', label: 'ATP', kind: 'leaf', parents: ['cellular-respiration', 'photosynthesis', 'gibbs-free-energy'] },
  { id: 'chlorophyll', label: 'Chlorophyll', kind: 'leaf', parents: ['photosynthesis'] },
  { id: 'dna-replication', label: 'DNA replication', kind: 'leaf', parents: ['genetics'] },
  { id: 'mendelian-inheritance', label: 'Mendelian inheritance', kind: 'leaf', parents: ['genetics'] },

  // PSYC 101
  { id: 'memory', label: 'Memory', kind: 'topic', parents: ['psyc101'] },
  { id: 'research-methods', label: 'Research methods', kind: 'topic', parents: ['psyc101'] },
  { id: 'learning', label: 'Learning', kind: 'topic', parents: ['psyc101'] },
  { id: 'retrieval-practice', label: 'Retrieval practice', kind: 'topic', parents: ['memory'] },
  { id: 'spaced-repetition', label: 'Spaced repetition', kind: 'topic', parents: ['memory'] },
  { id: 'working-memory', label: 'Working memory', kind: 'leaf', parents: ['memory'] },
  { id: 'testing-effect', label: 'Testing effect', kind: 'leaf', parents: ['retrieval-practice'] },
  { id: 'forgetting-curve', label: 'Forgetting curve', kind: 'leaf', parents: ['spaced-repetition'] },
  { id: 'statistics', label: 'Statistics', kind: 'topic', parents: ['research-methods', 'econ201'] },
  { id: 'experimental-design', label: 'Experimental design', kind: 'leaf', parents: ['research-methods'] },
  { id: 'hypothesis-testing', label: 'Hypothesis testing', kind: 'leaf', parents: ['statistics'] },
  { id: 'correlation-causation', label: 'Correlation vs causation', kind: 'leaf', parents: ['statistics'] },
  { id: 'classical-conditioning', label: 'Classical conditioning', kind: 'leaf', parents: ['learning'] },
  { id: 'operant-conditioning', label: 'Operant conditioning', kind: 'leaf', parents: ['learning'] }
];
