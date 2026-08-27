import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const htmlPath = path.join(ROOT_DIR, '1_4934080643215656811.html');
const coursesPath = path.join(ROOT_DIR, 'src', 'courses.js');

const html = fs.readFileSync(htmlPath, 'utf8');

// 1. Read existing courses.js to preserve all fine-tuned mathematics metadata
let existingCourses = [];
try {
    const existingCode = fs.readFileSync(coursesPath, 'utf8');
    const match = existingCode.match(/const COURSES = (\[[\s\S]*?\]);/);
    if (match) {
        existingCourses = eval(match[1]);
    }
} catch (e) {
    console.error("Failed to read existing courses:", e.message);
}

const mathCourseIds = new Set([
    "theory-of-numbers",
    "algebra-1",
    "algebra-2",
    "trigonometry",
    "sequence-series",
    "geometry",
    "coordinate-geometry",
    "vectors-3d",
    "calculus-1",
    "LPN7OFOL",
    "permutation-combination",
    "calculus-problem-solving",
    "probability-stats",
    "algebra-3",
    "rvp-1",
    "conic-sections",
    "rvp-2"
]);

existingCourses = existingCourses.filter(c => mathCourseIds.has(c.id));

// Mark existing courses as Mathematics
existingCourses.forEach(c => {
    c.subject = "Mathematics";
    c.subjectIcon = "fa-square-root-variable";
    c.subjectColor = "#6366f1";
});

const existingMathUids = new Set();
existingCourses.forEach(c => {
    (c.lectures || []).forEach(l => {
        if (l.uid) existingMathUids.add(l.uid);
    });
});

console.log(`Preserved ${existingCourses.length} core Math courses with ${existingMathUids.size} unique UIDs.`);

// 2. Parse HTML sections & lectures
const subjectRegex = /<section class="subject">([\s\S]*?)<\/section>/g;
let rawSections = [];
let sm;

while ((sm = subjectRegex.exec(html)) !== null) {
    const sHtml = sm[1];
    const h2 = sHtml.match(/<h2>(.*?)<\/h2>/);
    const title = h2 ? h2[1].trim() : '';

    const lessonRegex = /<article class="lesson">([\s\S]*?)<\/article>/g;
    let lm;
    let rawLessons = [];
    while ((lm = lessonRegex.exec(sHtml)) !== null) {
        const lHtml = lm[1];
        const numMatch = lHtml.match(/<div class="number">(.*?)<\/div>/);
        const titleMatch = lHtml.match(/<h3>(.*?)<\/h3>/);
        const dateMatch = lHtml.match(/<div class="date">📅 (.*?)<\/div>/);
        const videoMatch = lHtml.match(/href="[^"]*\/lesson-raw\/([A-Z0-9]{15,25})\/output\.webm"/);
        const pdfAnnoMatch = lHtml.match(/href="([^"]*?\/slides_pdf\/([A-Z0-9]{15,25})\/[^"]+?_with_anno\.pdf)"/);
        
        rawLessons.push({
            title: titleMatch ? titleMatch[1].trim() : '',
            date: dateMatch ? dateMatch[1].trim() : '',
            videoUid: videoMatch ? videoMatch[1] : null,
            pdfAnno: pdfAnnoMatch ? pdfAnnoMatch[1] : null,
            uid: videoMatch ? videoMatch[1] : (pdfAnnoMatch ? pdfAnnoMatch[2] : null)
        });
    }

    const lecs = [];
    for (let i = 0; i < rawLessons.length; i++) {
        const item = rawLessons[i];
        if (item.videoUid) {
            let pdf = null;
            if (i + 1 < rawLessons.length && rawLessons[i+1].uid === item.videoUid) {
                pdf = rawLessons[i+1].pdfAnno;
            }
            lecs.push({
                title: item.title,
                uid: item.videoUid,
                date: item.date,
                pdfUrl: pdf
            });
        }
    }

    if (lecs.length > 0) {
        rawSections.push({
            title,
            lectures: lecs
        });
    }
}

// 3. Define Course Cluster Configurations
const courseConfigs = [
    // === PHYSICS: STARTER & FOUNDATIONS ===
    {
        id: "basic-mathematics-physics",
        title: "Basic Mathematics for Physics (Mathematical Tools)",
        subject: "Physics",
        subjectIcon: "fa-atom",
        subjectColor: "#0ea5e9",
        subtitle: "Physics Starter - Mathematical Tools",
        description: "Essential mathematical tools for Physics: calculus foundations, vectors, trigonometry, differentiation, integration, and graphs for mechanics.",
        icon: "fa-calculator",
        matchTerms: ["basic mathematics"],
        isNew: true
    },

    // === PHYSICS COURSES ===
    {
        id: "kinematics-physics",
        title: "Kinematics & Motion in 1D & 2D",
        subject: "Physics",
        subjectIcon: "fa-atom",
        subjectColor: "#0ea5e9",
        subtitle: "Mechanics - JEE Advanced",
        description: "Rectilinear motion, calculus in kinematics, graphs, projectile motion, and relative velocity in 1D and 2D.",
        icon: "fa-person-running",
        matchTerms: ["kinematics"]
    },
    {
        id: "newtons-laws-friction",
        title: "Newton's Laws of Motion & Friction",
        subject: "Physics",
        subjectIcon: "fa-atom",
        subjectColor: "#0ea5e9",
        subtitle: "Mechanics - JEE Advanced",
        description: "Constraint relations, free body diagrams, pseudo force, static and kinetic friction, inclined planes, and pulley systems.",
        icon: "fa-weight-hanging",
        matchTerms: ["newton's laws of motion", "newton", "nlm"]
    },
    {
        id: "work-power-energy",
        title: "Work, Power & Energy",
        subject: "Physics",
        subjectIcon: "fa-atom",
        subjectColor: "#0ea5e9",
        subtitle: "Mechanics - JEE Advanced",
        description: "Work-energy theorem, conservative & non-conservative forces, potential energy curves, circular vertical motion, and power.",
        icon: "fa-bolt-lightning",
        matchTerms: ["work, power & energy", "work power"]
    },
    {
        id: "rotational-motion-com",
        title: "Centre of Mass, Momentum & Rotational Motion",
        subject: "Physics",
        subjectIcon: "fa-atom",
        subjectColor: "#0ea5e9",
        subtitle: "Mechanics - JEE Advanced",
        description: "Centre of mass, collision & momentum conservation, moment of inertia, torque, pure rolling, and angular momentum.",
        icon: "fa-rotate",
        matchTerms: ["rotation", "centre of mass", "center of mass"]
    },
    {
        id: "gravitation-physics",
        title: "Gravitation",
        subject: "Physics",
        subjectIcon: "fa-atom",
        subjectColor: "#0ea5e9",
        subtitle: "Mechanics - JEE Advanced",
        description: "Newton's law of gravitation, gravitational field and potential, satellite orbits, escape velocity, and Kepler's laws.",
        icon: "fa-globe",
        matchTerms: ["gravitation"]
    },
    {
        id: "oscillations-shm",
        title: "Oscillations & Simple Harmonic Motion",
        subject: "Physics",
        subjectIcon: "fa-atom",
        subjectColor: "#0ea5e9",
        subtitle: "Waves & Oscillations - JEE Advanced",
        description: "Kinematics & dynamics of SHM, spring-mass systems, simple and physical pendulums, superposition, and resonance.",
        icon: "fa-wave-square",
        matchTerms: ["oscillations", "shm"]
    },
    {
        id: "waves-sound",
        title: "Waves & Sound",
        subject: "Physics",
        subjectIcon: "fa-atom",
        subjectColor: "#0ea5e9",
        subtitle: "Waves & Acoustics - JEE Advanced",
        description: "Wave on a string, sound waves, speed of sound, interference, standing waves in organ pipes, beats, and Doppler effect.",
        icon: "fa-volume-high",
        matchTerms: ["waves"]
    },
    {
        id: "thermal-physics-heat",
        title: "Thermal Physics & Heat Transfer",
        subject: "Physics",
        subjectIcon: "fa-atom",
        subjectColor: "#0ea5e9",
        subtitle: "Thermal Physics - JEE Advanced",
        description: "Thermal expansion, calorimetry, heat transfer by conduction, convection and radiation, Stefan-Boltzmann law, and Newton's law of cooling.",
        icon: "fa-temperature-high",
        matchTerms: ["thermal physics"]
    },
    {
        id: "thermodynamics-physics",
        title: "Thermodynamics & KTG (Physics)",
        subject: "Physics",
        subjectIcon: "fa-atom",
        subjectColor: "#0ea5e9",
        subtitle: "Thermal Physics - JEE Advanced",
        description: "Kinetic theory of gases, degrees of freedom, First Law of Thermodynamics, PV diagrams, cyclic processes, and Carnot engine.",
        icon: "fa-fire-flame-curved",
        matchTerms: ["thermodynamics-02 jee advanced", "thermodynamics -01", "thermodynamics -02", "thermodynamics-1 jee advanced"]
    },
    {
        id: "electrostatics-physics",
        title: "Electrostatics & Gauss's Law",
        subject: "Physics",
        subjectIcon: "fa-atom",
        subjectColor: "#0ea5e9",
        subtitle: "Electromagnetism - JEE Advanced",
        description: "Coulomb's law, electric field calculation, Gauss's law & flux, electric potential, electric dipoles, and conductors in electrostatic equilibrium.",
        icon: "fa-bolt",
        matchTerms: ["electrostatics"]
    },
    {
        id: "capacitance-physics",
        title: "Capacitance & Dielectrics",
        subject: "Physics",
        subjectIcon: "fa-atom",
        subjectColor: "#0ea5e9",
        subtitle: "Electromagnetism - JEE Advanced",
        description: "Parallel plate capacitors, spherical & cylindrical capacitors, dielectric insertion, energy density, and RC charging/discharging circuits.",
        icon: "fa-microchip",
        matchTerms: ["capacitance"]
    },
    {
        id: "current-electricity",
        title: "Current Electricity",
        subject: "Physics",
        subjectIcon: "fa-atom",
        subjectColor: "#0ea5e9",
        subtitle: "Electromagnetism - JEE Advanced",
        description: "Drift velocity, Ohm's law, Kirchhoff's laws, symmetry methods, Wheatstone bridge, potentiometer, and heating effects.",
        icon: "fa-plug",
        matchTerms: ["current electricity"]
    },
    {
        id: "magnetism-physics",
        title: "Magnetism & Magnetic Effects of Current",
        subject: "Physics",
        subjectIcon: "fa-atom",
        subjectColor: "#0ea5e9",
        subtitle: "Electromagnetism - JEE Advanced",
        description: "Biot-Savart law, Ampere's circuital law, Lorentz force, motion of charges in magnetic fields, and magnetic dipoles.",
        icon: "fa-magnet",
        matchTerms: ["magnetism"]
    },
    {
        id: "electromagnetic-induction",
        title: "Electromagnetic Induction (EMI)",
        subject: "Physics",
        subjectIcon: "fa-atom",
        subjectColor: "#0ea5e9",
        subtitle: "Electromagnetism - JEE Advanced",
        description: "Magnetic flux, Faraday's laws, Lenz's law, motional EMF, self & mutual inductance, and LR circuits.",
        icon: "fa-arrows-spin",
        matchTerms: ["electromagnetic induction"]
    },
    {
        id: "alternating-current",
        title: "Alternating Current (AC)",
        subject: "Physics",
        subjectIcon: "fa-atom",
        subjectColor: "#0ea5e9",
        subtitle: "Electromagnetism - JEE Advanced",
        description: "Peak & RMS values, phasor diagrams, AC through R, L, C, series LCR circuits, power factor, resonance, and transformers.",
        icon: "fa-arrows-left-right",
        matchTerms: ["alternating current"]
    },
    {
        id: "ray-optics-instruments",
        title: "Ray Optics & Optical Instruments",
        subject: "Physics",
        subjectIcon: "fa-atom",
        subjectColor: "#0ea5e9",
        subtitle: "Optics - JEE Advanced",
        description: "Reflection from spherical mirrors, Snell's law, total internal reflection, refraction through prisms, thin lenses, and optical instruments.",
        icon: "fa-eye",
        matchTerms: ["ray optics"]
    },
    {
        id: "modern-physics",
        title: "Modern Physics & Nuclear Physics",
        subject: "Physics",
        subjectIcon: "fa-atom",
        subjectColor: "#0ea5e9",
        subtitle: "Modern Physics - JEE Advanced",
        description: "Photoelectric effect, de Broglie wavelength, Bohr model of hydrogen, X-rays, radioactive decay, mass defect, and nuclear reactions.",
        icon: "fa-satellite-dish",
        matchTerms: ["modern physics"]
    },

    // === CHEMISTRY: PHYSICAL CHEMISTRY ===
    {
        id: "mole-concept-redox",
        title: "Mole Concept, Stoichiometry & Redox",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Physical Chemistry - JEE Advanced",
        description: "Atomic & molar masses, empirical formula, limiting reagent, concentration terms (Molarity, Molality, Normality), and equivalent concept.",
        icon: "fa-scale-balanced",
        matchTerms: ["mole concept", "mole and redox", "redox and equivalent concept", "redox and equivalent"]
    },
    {
        id: "atomic-structure",
        title: "Atomic Structure & Quantum Mechanics",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Physical Chemistry - JEE Advanced",
        description: "Bohr's atomic model, dual nature of matter, Heisenberg uncertainty principle, quantum numbers, and radial distribution functions.",
        icon: "fa-atom",
        matchTerms: ["atomic structure"]
    },
    {
        id: "gaseous-state",
        title: "Gaseous State (Ideal & Real Gases)",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Physical Chemistry - JEE Advanced",
        description: "Gas laws, Dalton's law of partial pressures, Graham's law of diffusion, KTG, van der Waals equation for real gases, and critical state.",
        icon: "fa-wind",
        matchTerms: ["ideal gases", "real gases"]
    },
    {
        id: "chemical-thermodynamics",
        title: "Thermodynamics & Thermochemistry (Chem)",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Physical Chemistry - JEE Advanced",
        description: "State functions, First Law, enthalpy changes (combustion, formation), Hess's law, Second & Third Laws, and Gibbs Free Energy criteria.",
        icon: "fa-fire",
        matchTerms: ["thermodynamics -01", "thermodynamics -02", "thermodynamics-1"]
    },
    {
        id: "chemical-ionic-equilibrium",
        title: "Chemical & Ionic Equilibrium",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Physical Chemistry - JEE Advanced",
        description: "Equilibrium constant (Kp, Kc), Le Chatelier's principle, Ostwald's dilution, pH calculations, buffer solutions, and solubility product (Ksp).",
        icon: "fa-scale-unbalanced",
        matchTerms: ["equilibrium"]
    },
    {
        id: "chemical-kinetics",
        title: "Chemical Kinetics & Nuclear Chemistry",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Physical Chemistry - JEE Advanced",
        description: "Rate of reaction, rate law & order, integrated rate equations (0th, 1st, 2nd order), Arrhenius equation, and collision theory.",
        icon: "fa-stopwatch",
        matchTerms: ["chemical kinetics"]
    },
    {
        id: "electrochemistry",
        title: "Electrochemistry & Conductance",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Physical Chemistry - JEE Advanced",
        description: "Galvanic cells, Nernst equation, electrolytic cells & Faraday's laws, Kohlrausch law, molar conductivity, and electrochemical series.",
        icon: "fa-car-battery",
        matchTerms: ["electrochemistry", "electrocheistry"]
    },
    {
        id: "liquid-solutions",
        title: "Liquid Solutions & Colligative Properties",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Physical Chemistry - JEE Advanced",
        description: "Raoult's law, ideal & non-ideal solutions, azeotropes, elevation in boiling point, depression in freezing point, and van 't Hoff factor.",
        icon: "fa-water",
        matchTerms: ["liquid solutions", "liquid solution"]
    },
    {
        id: "solid-state",
        title: "Solid State",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Physical Chemistry - JEE Advanced",
        description: "Crystal lattices & unit cells, packing efficiency, cubic systems (SC, BCC, FCC), voids, coordination numbers, and crystal defects.",
        icon: "fa-cubes",
        matchTerms: ["solid states", "solid state"]
    },
    {
        id: "physical-chem-pyqs",
        title: "Physical Chemistry Advanced PYQs & Mixed",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Physical Chemistry - JEE Advanced",
        description: "Comprehensive problem solving and multi-concept integer and numerical questions across all Physical Chemistry units.",
        icon: "fa-list-check",
        matchTerms: ["physical chemistry", "physical chem"]
    },

    // === CHEMISTRY: INORGANIC CHEMISTRY ===
    {
        id: "periodic-table-periodicity",
        title: "Periodic Table & Periodicity in Properties",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Inorganic Chemistry - JEE Advanced",
        description: "Modern periodic law, periodic trends in atomic radii, ionization enthalpy, electron gain enthalpy, electronegativity, and diagonal relationships.",
        icon: "fa-table-cells",
        matchTerms: ["periodic table and periodicity", "periodic table"]
    },
    {
        id: "chemical-bonding",
        title: "Chemical Bonding & Molecular Structure",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Inorganic Chemistry - JEE Advanced",
        description: "Lewis structures, VSEPR theory, hybridization, dipole moments, Molecular Orbital Theory (MOT), and hydrogen bonding.",
        icon: "fa-circle-nodes",
        matchTerms: ["chemical bonding", "periodic table and chemical bonding"]
    },
    {
        id: "coordination-chemistry",
        title: "Coordination Chemistry & Metal Complexes",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Inorganic Chemistry - JEE Advanced",
        description: "IUPAC nomenclature, Werner's theory, isomerism in coordination compounds, Valence Bond Theory, and Crystal Field Theory (CFT).",
        icon: "fa-gem",
        matchTerms: ["co-ordination chemistry", "coordination chemistry"]
    },
    {
        id: "salt-analysis",
        title: "Qualitative Inorganic Salt Analysis",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Inorganic Chemistry - JEE Advanced",
        description: "Systematic group analysis of basic radicals (cations) and acidic radicals (anions), flame tests, and confirmatory color reactions.",
        icon: "fa-vial",
        matchTerms: ["salt analysis", "melting point and solubility"]
    },
    {
        id: "metallurgy-inorganic",
        title: "Metallurgy & Principles of Extraction",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Inorganic Chemistry - JEE Advanced",
        description: "Concentration of ores, Ellingham diagrams, pyrometallurgy, hydrometallurgy, electrometallurgy, and refining techniques (Al, Fe, Cu, Zn).",
        icon: "fa-mountain",
        matchTerms: ["metallurgy"]
    },
    {
        id: "p-block-chemistry",
        title: "p-Block Elements (Groups 13 to 18)",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Inorganic Chemistry - JEE Advanced",
        description: "Inert pair effect, allotropy, structures of oxoacids of P and S, halides of B and Si, interhalogens, and noble gas compounds.",
        icon: "fa-layer-group",
        matchTerms: ["p block", "p-block"]
    },
    {
        id: "d-f-block-elements",
        title: "d- and f-Block Elements & Coordination",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Inorganic Chemistry - JEE Advanced",
        description: "Electronic configurations, variable oxidation states, magnetic properties, catalytic behavior, potassium dichromate, KMnO4, and lanthanoid contraction.",
        icon: "fa-circle-dot",
        matchTerms: ["d & f block", "d & f-block", "d and f block"]
    },
    {
        id: "block-chemistry-mixed",
        title: "Block Chemistry & Inorganic Mixed PYQs",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Inorganic Chemistry - JEE Advanced",
        description: "Comprehensive multi-concept revision, reaction mapping, and advanced inorganic questions across all blocks.",
        icon: "fa-flask",
        matchTerms: ["block chemistry", "inorganic chemistry", "inorganic 2025", "inorganic chem"]
    },

    // === CHEMISTRY: ORGANIC CHEMISTRY ===
    {
        id: "iupac-goc",
        title: "IUPAC Nomenclature & General Organic Chemistry (GOC)",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Organic Chemistry - JEE Advanced",
        description: "IUPAC rules, inductive effect, resonance & mesomeric effect, hyperconjugation, aromaticity (Hückel's rule), and stability of carbocations/carbanions/radicals.",
        icon: "fa-dna",
        matchTerms: ["iupac", "g.o.c", "complete g.o.c", "goc", "g.i.o.c"]
    },
    {
        id: "isomerism-organic",
        title: "Complete Isomerism (Structural & Stereo)",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Organic Chemistry - JEE Advanced",
        description: "Chain, positional, functional, tautomerism, geometrical isomerism (cis/trans, E/Z), optical isomerism (chirality, enantiomers, diastereomers), and conformations.",
        icon: "fa-shapes",
        matchTerms: ["complete isomerism", "isomerism"]
    },
    {
        id: "reaction-mechanisms",
        title: "Organic Reaction Mechanisms (Substitution & Elimination)",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Organic Chemistry - JEE Advanced",
        description: "Nucleophilic substitution (SN1, SN2, SNi), Elimination reactions (E1, E2, E1cb), Electrophilic additions, and carbocation rearrangements.",
        icon: "fa-route",
        matchTerms: ["reaction mechanism"]
    },
    {
        id: "hydrocarbons-halogen",
        title: "Hydrocarbons & Halogen Derivatives (Alkanes, Alkenes, Alkynes)",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Organic Chemistry - JEE Advanced",
        description: "Preparation and reactions of alkanes, alkenes (Markovnikov addition, ozonolysis), alkynes, and alkyl/aryl halides (haloalkanes & haloarenes).",
        icon: "fa-droplet",
        matchTerms: ["hydrocarbons and halogen", "hydrocarbons", "hydrocarbon"]
    },
    {
        id: "carbonyl-compounds",
        title: "Carbonyl Compounds (Aldehydes, Ketones & Acids)",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Organic Chemistry - JEE Advanced",
        description: "Nucleophilic addition, Aldol condensation, Cannizzaro reaction, Grignard additions, oxidation/reduction, and carboxylic acid derivatives.",
        icon: "fa-circle-half-stroke",
        matchTerms: ["carbonyl compounds"]
    },
    {
        id: "biomolecules-polymers",
        title: "Biomolecules, Polymers & Everyday Chemistry",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Organic Chemistry - JEE Advanced",
        description: "Carbohydrates (glucose, fructose), amino acids, peptide bonds, proteins, nucleic acids, addition & condensation polymers, and classification.",
        icon: "fa-leaf",
        matchTerms: ["biomolecules and polymers", "biomolecules", "p.o.c & biomolecules"]
    },
    {
        id: "aromatic-chemistry",
        title: "Aromatic Compounds & Electrophilic Substitution",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Organic Chemistry - JEE Advanced",
        description: "Benzene electrophilic substitution (nitration, halogenation, Friedel-Crafts), activating & deactivating groups, orientation, and directing effects.",
        icon: "fa-draw-polygon",
        matchTerms: ["aromatic chemistry", "aromatic"]
    },
    {
        id: "alcohols-amines-ethers",
        title: "Alcohols, Phenols, Ethers & Amines",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Organic Chemistry - JEE Advanced",
        description: "Acidity of phenols, Reimer-Tiemann reaction, Kolbe's reaction, Williamson ether synthesis, Gabriel phthalimide synthesis, and Hinsberg test.",
        icon: "fa-wine-bottle",
        matchTerms: ["alcohols, amines and ethers", "alcohols"]
    },
    {
        id: "practical-organic-chem",
        title: "Practical Organic Chemistry (POC) & Tests",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Organic Chemistry - JEE Advanced",
        description: "Functional group detection (Lucas test, Tollens' test, Fehling's test, 2,4-DNP, Iodoform test, Carbylamine test) and qualitative organic analysis.",
        icon: "fa-vial-circle-check",
        matchTerms: ["practical organic chemistry"]
    },
    {
        id: "organic-mixed-pyqs",
        title: "Organic Chemistry Advanced Mixed PYQs",
        subject: "Chemistry",
        subjectIcon: "fa-flask-vial",
        subjectColor: "#10b981",
        subtitle: "Organic Chemistry - JEE Advanced",
        description: "Multi-step syntheses, integer type problems, roadmap problems, and comprehensive JEE Advanced PYQ discussions.",
        icon: "fa-pen-ruler",
        matchTerms: ["organic chemistry mixed", "organic mixed", "organic ncert", "organic chem"]
    },

    // === MENTORSHIP & PROBLEM SOLVING ===
    {
        id: "im-all-stars-mentorship",
        title: "IM All Stars Intensive Mentorship (JEE Main & Advanced)",
        subject: "Mentorship",
        subjectIcon: "fa-trophy",
        subjectColor: "#f59e0b",
        subtitle: "All Stars Rank Accelerator",
        description: "Comprehensive problem solving and high-impact strategy sessions across physics, chemistry, and mathematics for top JEE percentiles.",
        icon: "fa-star",
        matchTerms: ["im all stars", "im all stars (jm)"]
    },
    {
        id: "mixed-problem-solving-modules",
        title: "Advanced Mixed Problem Solving & Module Discussions",
        subject: "Mentorship",
        subjectIcon: "fa-trophy",
        subjectColor: "#f59e0b",
        subtitle: "Problem Solving Situation Sets",
        description: "Integrated problem solving situation sets, module discussions, doubt clearings, and challenging multi-concept situation sets.",
        icon: "fa-brain",
        matchTerms: ["mixed", "problem solving", "module discussion", "dpp discussion"]
    }
];

// Helper to clean lecture title
function cleanLectureTitle(rawTitle, rank) {
    if (!rawTitle) return `Lecture ${rank}`;
    let title = rawTitle
        .replace(/&amp;/g, '&')
        .replace(/&#x27;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/^L-\d+\s*\|\s*/i, '')
        .replace(/^L-\d+;\s*/i, '')
        .replace(/^L-\d+-\s*/i, '')
        .replace(/^Lec[_\s]+\d+[:\s-]*/i, '')
        .trim();
    return title || `Lecture ${rank}`;
}

// 4. Ingest raw HTML lectures into Course Configs
const generatedCourses = [];

for (const cfg of courseConfigs) {
    const matchingSections = rawSections.filter(sec => {
        const lower = sec.title.toLowerCase().replace(/&amp;/g, '&').replace(/&#x27;/g, "'");
        return cfg.matchTerms.some(term => lower.includes(term));
    });

    const combinedLectures = [];
    const seenUids = new Set();

    matchingSections.forEach(sec => {
        sec.lectures.forEach(lec => {
            if (cfg.id !== "basic-mathematics-physics" && existingMathUids.has(lec.uid)) {
                return;
            }
            if (!seenUids.has(lec.uid)) {
                seenUids.add(lec.uid);
                combinedLectures.push(lec);
            }
        });
    });

    if (combinedLectures.length > 0) {
        let durationCache = {};
        try {
            const cachePath = path.join(ROOT_DIR, 'scripts', 'durations_cache.json');
            if (fs.existsSync(cachePath)) {
                durationCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            }
        } catch (e) {}

        const formattedLectures = combinedLectures.map((l, idx) => {
            const exactDur = durationCache[l.uid] || (l.duration && l.duration !== "2h 00m" ? l.duration : "1h 45m");
            return {
                rank: idx + 1,
                title: cleanLectureTitle(l.title, idx + 1),
                uid: l.uid,
                duration: exactDur,
                date: l.date || "",
                pdfUrl: l.pdfUrl || `https://player.uacdn.net/slides_pdf/${l.uid}/notes_with_anno.pdf`
            };
        });

        generatedCourses.push({
            id: cfg.id,
            title: cfg.title,
            subject: cfg.subject,
            subjectIcon: cfg.subjectIcon,
            subjectColor: cfg.subjectColor,
            subtitle: cfg.subtitle,
            description: cfg.description,
            icon: cfg.icon,
            startDate: formattedLectures[0].date ? new Date(formattedLectures[0].date.split('-').reverse().join('-')).toISOString() : "2025-01-01T10:00:00Z",
            badge: `${formattedLectures.length} Lectures`,
            lectures: formattedLectures
        });
    }
}

// 5. Merge existing Math courses with newly generated courses
const fullCatalog = [...existingCourses, ...generatedCourses];

console.log(`\n================ FULL CATALOG COMPILED ================`);
console.log(`Total Courses: ${fullCatalog.length}`);
console.log(`- Mathematics Courses: ${fullCatalog.filter(c => c.subject === 'Mathematics').length}`);
console.log(`- Physics Courses:     ${fullCatalog.filter(c => c.subject === 'Physics').length}`);
console.log(`- Chemistry Courses:   ${fullCatalog.filter(c => c.subject === 'Chemistry').length}`);
console.log(`- Mentorship Courses:  ${fullCatalog.filter(c => c.subject === 'Mentorship').length}`);

const totalLecs = fullCatalog.reduce((sum, c) => sum + c.lectures.length, 0);
console.log(`Total Compiled Lectures: ${totalLecs}`);

// 6. Generate src/courses.js file
const coursesOutputCode = `// Course catalogs registry module (Dynamically Generated Multi-Subject Library)

const COURSES = ${JSON.stringify(fullCatalog, null, 4)};

function findCourseByLectureUid(uid) {
    if (!uid) return null;
    return COURSES.find(c => c.lectures && c.lectures.some(l => l.uid === uid));
}

function findLectureInCourses(uid) {
    if (!uid) return null;
    for (const c of COURSES) {
        const lec = c.lectures.find(l => l.uid === uid);
        if (lec) return { course: c, lecture: lec };
    }
    return null;
}

export { COURSES, findCourseByLectureUid, findLectureInCourses };
`;

fs.writeFileSync(coursesPath, coursesOutputCode, 'utf8');
console.log(`\nSuccessfully updated ${coursesPath}!`);
