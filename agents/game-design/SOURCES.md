# Game Design Evidence Register

## Method

This register contains exactly 20 real sources read on 2026-07-23. Preference was
given to original papers, university repositories, first-party developer
material, and official accessibility guidance.

“Evidence of relevance” states what the source actually contributes to game
design. “Limits” prevents a useful result from becoming a universal law. The
source number is used throughout `KNOWLEDGE_CORE.md` as `[S#]`.

## Sources

| # | Source | Evidence of relevance | Used for | Limits |
|---|---|---|---|---|
| 1 | [Hunicke, LeBlanc & Zubek — MDA: A Formal Approach to Game Design and Game Research](https://users.cs.northwestern.edu/~hunicke/MDA.pdf) | Separates mechanics, run-time dynamics, and desired aesthetics, and explicitly links them causally. The paper also reverses the lens for players: they encounter the experience first, infer dynamics, then learn mechanics. This directly supports experience-first specifications and causal design reviews. | Player promise, MDA chain, design diagnosis. | A framework and vocabulary, not an empirical formula for “fun”; its categories are lenses, not exhaustive truth. |
| 2 | [Greg Costikyan — I Have No Words & I Must Design](https://costik.com/nowords2002.pdf) | Builds a design vocabulary around endogenous meaning, goals, struggle, decisions, uncertainty, resources, information and opposition. This makes it relevant to distinguishing a game from a feature set and to checking whether choices create meaningful play. | Decision design, uncertainty, goals, system vocabulary. | Foundational practitioner essay; concepts are argued through examples rather than controlled studies. |
| 3 | [Miguel Sicart — Defining Game Mechanics](https://gamestudies.org/0801/articles/sicart) | Defines mechanics as methods invoked by agents to interact with game state, distinguishes performative mechanics from normative rules, and maps mechanics to inputs, challenges and player experience. This supports precise mechanic specs written as verbs and state changes. | Mechanic specification, agency, documentation. | The author explicitly says the definition has grey areas and is not an ultimate definition. |
| 4 | [Doug Church — Formal Abstract Design Tools](https://www.gamedeveloper.com/design/formal-abstract-design-tools) | Shows why “fun” is not an actionable design language and develops intention and perceivable consequence as reusable tools. The article demonstrates that consequences attached to intentional actions strengthen responsibility and control, while tools can conflict and must serve the chosen experience. | Agency, consequence, design vocabulary, trade-offs. | Practitioner framework, not an exhaustive taxonomy or validated scorecard. |
| 5 | [Machinations — Framework Basics](https://machinations.gitbook.io/docs/getting-started/framework-basics) | Formalizes internal economies as resource flows through sources, pools, drains, converters, traders and gates, with state connections modifying flows. This directly supports economy diagrams, feedback-loop inspection and pre-implementation simulation. | Resources, economies, progression loops, systemic balance. | Official tool documentation; a model is only as valid as its assumptions and does not replace playtesting. |
| 6 | [Sweetser & Wyeth — GameFlow: A Model for Evaluating Player Enjoyment in Games](https://www.valuesatplay.org/wp-content/uploads/2007/09/sweetser.pdf) | Synthesizes concentration, challenge, player skill, control, clear goals, feedback, immersion and social interaction into evaluation criteria. Its expert comparison distinguished a highly rated from a poorly rated RTS and exposed specific experience failures. | Experience review, challenge, goals, feedback, control. | Initial validation used two RTS games and expert review; the paper itself says the criteria were not yet a complete developer evaluation tool. |
| 7 | [Ryan, Rigby & Przybylski — The Motivational Pull of Video Games](https://doi.org/10.1007/s11031-006-9051-8) | Across four studies, perceived autonomy and competence were associated with enjoyment, preference and well-being; in the multiplayer study, autonomy, competence and relatedness independently predicted enjoyment and future play. This supports needs-based motivation without reducing players to reward schedules. | Motivation, agency, mastery, co-op relatedness. | Associations and short-term studies across a limited game set; does not prescribe a mechanic or prove every audience values each need equally. |
| 8 | [Hunicke & Chapman — AI for Dynamic Difficulty Adjustment in Games](https://www.cs.northwestern.edu/~hunicke/pubs/Hamlet.pdf) | Models challenge through resource supply and demand and shows how inventory abundance changes player tactics. It also explicitly warns that dynamic adjustment transfers control from designers to code. This supports difficulty as a multidimensional system and demands transparency/guardrails for adaptation. | Difficulty axes, resource pressure, adaptation risks. | Early FPS prototype; dynamic adjustment can damage trust and is not required or suitable for every game. |
| 9 | [Michael Booth / Valve — The AI Systems of Left 4 Dead](https://steamcdn-a.akamaihd.net/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf) | Describes goals of replayability and dramatic pacing, and “structured unpredictability”: designer-bounded variation rather than pure randomness or uniform scripting. It also shows that co-op bots were tuned for fairness, predictability and trust. | Intensity pacing, bounded variation, co-op trust. | Postmortem for one four-player shooter; its procedural population and AI architecture are context-specific implementation choices, not universal requirements. |
| 10 | [Riot Games — Champion Counterplay](https://www.leagueoflegends.com/en-us/news/dev/quick-gameplay-thoughts-may-14/) | Defines counterplay as an action, choice or strategy that mitigates a threat; separates tactical and strategic counterplay; links clear usable responses to fairness and depth; and argues that impact should be proportional to response opportunity. | Combat fairness, telegraphs, weakness design, counter-builds. | First-party philosophy for a competitive live game, not controlled research and not automatically portable to PvE. |
| 11 | [Kenneth Hullett — The Science of Level Design](https://escholarship.org/uc/item/1m25b5j5) | Establishes cause–effect relationships between geometry, AI/item placement and player behavior using level-design patterns and an extensive user study. This supports specifying spatial intent as expected behavior rather than only describing art or layout. | Level grammar, spatial affordances, behavior validation. | FPS-focused dissertation; transfer to other cameras, genres and control schemes requires testing. |
| 12 | [El-Nasr et al. — Understanding and Evaluating Cooperative Games](https://doi.org/10.1145/1753326.1753363) | Derives cooperative patterns from 14 games and evaluates them with 60 participants in groups of two or three, using observed cooperative performance metrics and inter-rater agreement. This supports designing and measuring co-op as behavior, not merely simultaneous presence. | Complementarity, shared actions, co-op metrics, rescue play. | Four evaluated games and mostly younger participants; findings require validation for adult 1–5 player ARPG sessions. |
| 13 | [Pinelle, Wong & Stach — Heuristic Evaluation for Games](https://doi.org/10.1145/1357054.1357282) | Analyzes reviews of 108 PC games across six genres, identifies 12 recurring usability problem classes and derives 10 heuristics, including consistent response, customizable mappings, status visibility and non-intrusive interfaces. | Control reliability, feedback, UI/playability preflight. | Review-derived heuristics with preliminary evaluation; PC-focused and unable to replace observation of target players. |
| 14 | [Medlock et al. — Using the RITE Method to Improve Products](https://jpattonassociates.com/wp-content/uploads/2015/04/rite_method.pdf) | Defines Rapid Iterative Testing and Evaluation: make evidence-backed fixes between sessions, then immediately verify them. The Age of Empires II tutorial case reports a high ratio of problems found to fixes made and empirical verification of fixes. | Iterative playtesting, onboarding, fast verification. | Case study emphasizes usability/tutorial issues; rapid changes require clear evidence and change control to avoid confounds. |
| 15 | [Microsoft — Xbox Accessibility Guidelines](https://learn.microsoft.com/en-us/xbox/accessibility/guidelines) | Provides design, implementation and test guidance developed with industry experts and the Gaming & Disability Community, covering text, contrast, multimodal cues, input, difficulty, object clarity, time limits, motion, photosensitivity and communication. | Accessibility requirements and acceptance tests. | Best-practice guidance, not a legal compliance checklist; each feature still needs testing with affected players. |
| 16 | [Zagal, Björk & Lewis — Dark Patterns in the Design of Games](https://ri.diva-portal.org/smash/get/diva2%3A1043332/FULLTEXT01.pdf) | Defines dark game design patterns as intentional patterns causing negative experiences against player interests and likely without consent; identifies time, money and social capital as manipulation surfaces. This supports explicit ethical gates for grind, appointments and obscured spending. | Ethics, retention, progression and monetization guardrails. | Intent and consent can be difficult to infer; a pattern can be ethical or dark depending on implementation and audience expectations. |
| 17 | [Thomas Malone — Toward a Theory of Intrinsically Motivating Instruction](https://doi.org/10.1207/s15516709cog0504_2) | Studies motivating computer games and organizes intrinsic appeal around challenge, fantasy and curiosity. Challenge relies on meaningful goals with uncertain outcomes; curiosity benefits from an intelligible but incomplete model. | Onboarding, learning, uncertainty, fantasy–mechanic fit. | Instructional context and early computer games; not a universal retention recipe or justification for opaque randomness. |
| 18 | [Björk, Lundgren & Holopainen — Game Design Patterns](https://doi.org/10.26503/dl.v2003i1.60) | Presents patterns as descriptions of recurring gameplay-relevant interaction, with a structural model for analyzing how components and agents affect play. This supports reusable design language and explicit consequences without treating patterns as copy-paste solutions. | Pattern library, comparison, design alternatives. | Early framework under continued expansion/validation; patterns expose possibilities and consequences, not guaranteed quality. |
| 19 | [Alexander Jaffe — Understanding Game Balance with Quantitative Methods](https://digital.lib.washington.edu/researchworks/items/dbc8bf95-8039-4353-9fb4-9a5de83678ce) | Argues that balance must be contextualized by player behavior and skill, formalizes several meanings of balance, and combines simulation, gameplay data and visualization. This directly rejects a single global win-rate or spreadsheet as sufficient proof. | Balance models, skill segmentation, simulation and data. | Competitive-game emphasis and doctoral methods; quantitative analysis supplements design intent and playtests rather than deciding them. |
| 20 | [Drachen & Canossa — Towards Gameplay Analysis via Gameplay Metrics](https://doi.org/10.1145/1621841.1621878) | Defines gameplay metrics as instrumentation of player behavior and player–game interaction, demonstrates spatial path/health/cover analysis in commercial games, and treats telemetry as a supplement to usability and playability testing. | Event design, behavioral evidence, level/encounter diagnosis. | Case studies are shooters; telemetry shows what happened, not why or whether the player enjoyed it. |

## Cross-Source Conclusions

- Start from an intended experience, but specify the mechanics and observable
  dynamics that could cause it: sources 1, 3, 4 and 6.
- A mechanic is not a noun or feature name; it is player/agent action, rules,
  state transition, feedback and consequences: sources 2–4.
- Motivation cannot be reduced to rewards. Agency, competence, relatedness,
  clear goals, feedback and intelligible challenge all matter: sources 6, 7
  and 17.
- High impact requires legible counterplay; failure must be attributable to a
  decision or execution error rather than hidden arbitrariness: sources 4, 6,
  10 and 13.
- Economy and balance models expose feedback and sensitivity, but must remain
  hypotheses until behavior is observed: sources 5, 8, 19 and 20.
- Geometry and encounter composition are behavioral systems, not decoration:
  sources 9–11 and 20.
- Co-op needs mechanics and metrics that create interdependence without
  coercive dependency: sources 7, 9 and 12.
- Heuristics find risks; target-player testing verifies them. Iterate quickly,
  but preserve causal clarity: sources 13, 14 and 20.
- Accessibility and ethics are design constraints from the beginning, not
  polish: sources 15 and 16.

## Known Evidence Gaps

- No source provides a universal numeric rule for TTK, telegraph duration,
  encounter density, reward cadence, run length or difficulty. These are
  project hypotheses and require genre- and audience-specific playtests.
- Most empirical samples are limited by genre, platform, age, period or sample
  size. Transfer to an isometric 1–5 player action RPG must be tested.
- Public studies cannot prove any project's specific mechanics, content or
  experience. Project documents supply local invariants and hypotheses; they do
  not become external evidence.
- Telemetry cannot recover intention, comprehension or emotion by itself.
  Observation, interview and behavioral instrumentation must be triangulated.
