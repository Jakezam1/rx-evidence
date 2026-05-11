export const demoData = {
  trialName: "PARADIGM-HF",
  demoBanner: "Viewing demo analysis — PARADIGM-HF trial",
  findings: [
    {
      id: "f-primary",
      category: "primary_outcome",
      title: "Reduced CV death/HF hospitalization",
      summary:
        "Sacubitril/valsartan reduced the composite of cardiovascular death or heart failure hospitalization compared with enalapril in symptomatic HFrEF.",
      clinicalImplication:
        "For eligible HFrEF patients, ARNI therapy can replace ACE inhibitor therapy to reduce major HF outcomes.",
      confidenceLevel: "high",
      statistics: { HR: "0.80", CI95: "0.73-0.87", pValue: "<0.001", ARR: "4.7%", NNT: "21" },
      sourcePassages: [
        {
          text: "The primary outcome occurred in 21.8% of the enalapril group and 17.0% of the LCZ696 group.",
          sectionName: "Results",
          pageHint: "Page 8"
        }
      ]
    },
    {
      id: "f-context",
      category: "context",
      title: "Active comparator design",
      summary:
        "The trial compared ARNI against guideline-standard enalapril rather than placebo, strengthening clinical relevance.",
      clinicalImplication: "Results are directly useful for therapy selection in standard clinical practice.",
      confidenceLevel: "high",
      statistics: { RR: "0.78" },
      sourcePassages: [
        {
          text: "Patients were randomly assigned to receive enalapril 10 mg twice daily or LCZ696 200 mg twice daily.",
          sectionName: "Methods",
          pageHint: "Page 4"
        }
      ]
    },
    {
      id: "f-pop",
      category: "population",
      title: "Symptomatic chronic HFrEF cohort",
      summary:
        "Participants had NYHA class II-IV HF with reduced ejection fraction and elevated natriuretic peptides.",
      clinicalImplication: "Applicability is strongest for ambulatory HFrEF patients meeting similar severity thresholds.",
      confidenceLevel: "high",
      statistics: { absoluteEvents: "8442 randomized" },
      sourcePassages: [
        {
          text: "Patients had NYHA class II, III, or IV heart failure and an ejection fraction of 40% or less.",
          sectionName: "Methods",
          pageHint: "Page 3"
        }
      ]
    },
    {
      id: "f-bias",
      category: "bias",
      title: "Run-in phase limits generalizability",
      summary:
        "Sequential run-in with both drugs may have excluded patients unable to tolerate target doses, potentially biasing tolerability estimates.",
      clinicalImplication:
        "Real-world discontinuation and adverse effects may be higher than observed in the randomized phase.",
      confidenceLevel: "moderate",
      statistics: {},
      sourcePassages: [
        {
          text: "Before randomization, participants had to complete single-blind run-in periods with enalapril and LCZ696.",
          sectionName: "Methods",
          pageHint: "Page 4"
        }
      ]
    },
    {
      id: "f-safety",
      category: "safety",
      title: "Less renal dysfunction and hyperkalemia",
      summary:
        "ARNI had lower rates of renal impairment, hyperkalemia, and cough, but more symptomatic hypotension.",
      clinicalImplication:
        "Monitor blood pressure closely while expecting a favorable renal and potassium profile versus enalapril.",
      confidenceLevel: "high",
      statistics: { NNH: "36 (symptomatic hypotension)" },
      sourcePassages: [
        {
          text: "Symptomatic hypotension was more common with LCZ696, but renal impairment, hyperkalemia, and cough were less common.",
          sectionName: "Results",
          pageHint: "Page 9"
        }
      ]
    }
  ],
  pico: {
    population: "Adults with chronic symptomatic HFrEF (mostly NYHA II-III), LVEF <= 40% (later <=35%), elevated BNP/NT-proBNP.",
    intervention: "Sacubitril/valsartan (LCZ696) 200 mg twice daily after run-in titration.",
    comparator: "Enalapril 10 mg twice daily (active standard-of-care comparator).",
    outcomes:
      "Primary: CV death or first HF hospitalization. Secondary: all-cause mortality, change in symptoms, safety outcomes.",
    studyDesign: "Multinational, double-blind, randomized active-controlled trial; median follow-up 27 months."
  },
  bias: {
    randomization: { ai: "Low", support: "Central randomization and double-blind allocation were used." },
    deviations: { ai: "Some concerns", support: "Run-in phase may select for treatment-tolerant participants." },
    missingData: { ai: "Low", support: "Outcome ascertainment was robust with low missing endpoint data." },
    measurement: { ai: "Low", support: "Hard clinical outcomes were adjudicated by blinded committees." },
    selection: { ai: "Some concerns", support: "Subgroup interpretation requires caution despite pre-specified analyses." },
    overall: "Some concerns"
  },
  summary: {
    grade: "A",
    bottomLine:
      "In PARADIGM-HF, sacubitril/valsartan improved clinically meaningful outcomes versus enalapril in symptomatic HFrEF.",
    efficacy:
      "The composite primary endpoint was reduced with HR 0.80 and ARR 4.7%, yielding an NNT of about 21 over trial follow-up.",
    safety:
      "Symptomatic hypotension increased (NNH about 36), but renal dysfunction, hyperkalemia, and cough were less frequent.",
    applicability:
      "Best fit is ambulatory HFrEF patients similar to trial inclusion criteria; tolerability may differ outside run-in selected cohorts."
  }
};
