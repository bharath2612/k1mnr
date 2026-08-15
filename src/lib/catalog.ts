/**
 * Product & industry catalog — the data behind /products/* and /industries/*.
 *
 * Every specification here is a TYPICAL, INDICATIVE range (standard industry
 * bands), not a contractual commitment: pages must say so, and the per-
 * consignment COA is what governs. When K One supplies the exact grades they
 * trade, tighten these numbers here and every page updates.
 */

export interface SpecTable {
  caption: string;
  head: string[];
  rows: string[][];
}

export interface Product {
  slug: string;
  name: string;
  /** Card eyebrow, e.g. "Energy" / "Minerals". */
  category: string;
  /** One-liner for listing cards. */
  blurb: string;
  /** Body paragraphs for the detail page. */
  description: string[];
  specs: SpecTable;
  /** "Sourced from" line. */
  origins: string;
  lotSizes: string;
  /** Discharge/delivery line; omit for road-and-rail-only materials. */
  delivery: string;
  industries: string[]; // industry slugs
  seoTitle: string;
  seoDescription: string;
}

export interface Industry {
  slug: string;
  name: string;
  blurb: string;
  description: string[];
  /** Product slugs, in the order they matter to this industry. */
  inputs: { slug: string; role: string }[];
  seoTitle: string;
  seoDescription: string;
}

const EAST_COAST_PORTS =
  'East-coast discharge: Krishnapatnam, Visakhapatnam, Gangavaram, Kakinada and Karaikal; inland movement by rail rake or road to plant.';

export const PRODUCTS: Product[] = [
  {
    slug: 'thermal-coal',
    name: 'Thermal Coal',
    category: 'Energy',
    blurb: 'Domestic steam coal for power generation and industrial heating, graded by GCV band.',
    description: [
      'Domestic thermal coal supplied against your boiler or kiln specification — GCV band, ash and sizing agreed up front, with third-party sampling and analysis at despatch.',
      'We plan rakes and road movement around your consumption and stockyard capacity, so the fuel arrives as a schedule, not as a surprise.',
    ],
    specs: {
      caption: 'Typical specification ranges — domestic thermal coal',
      head: ['Property', 'Typical range'],
      rows: [
        ['Gross calorific value (GAR)', '3,800 – 5,800 kcal/kg, by grade'],
        ['Total moisture', '8 – 15%'],
        ['Ash', '25 – 34%'],
        ['Total sulphur', '0.3 – 0.6%'],
        ['Volatile matter', '20 – 30%'],
        ['Size', '0 – 50 mm, crushed to order'],
      ],
    },
    origins: 'Sourced from Telangana and Odisha coalfields via e-auction and linkage channels.',
    lotSizes: 'Typical lots: 2,000 – 25,000 MT by rake or road; recurring monthly programmes supported.',
    delivery: 'Delivered by rail rake or road to plant gate across South and Central India.',
    industries: ['power', 'cement'],
    seoTitle: 'Thermal Coal Supplier — GCV-Graded Steam Coal | K One Minerals',
    seoDescription:
      'Domestic thermal coal by GCV band (3,800–5,800 kcal/kg GAR) with third-party sampling, for power plants, cement kilns and industrial boilers. Rake and road delivery.',
  },
  {
    slug: 'imported-coal',
    name: 'Imported Coal',
    category: 'Energy',
    blurb: 'Indonesian, South African, Australian and US steam coal, inspected at load port on every consignment.',
    description: [
      'Seaborne steam coal secured against your specification, with third-party inspection at load port on every consignment and the full documentation set — BL, COA, weight and quality certificates — on every shipment.',
      'Laycans are confirmed in writing and deviations notified within 24 hours; demurrage terms are agreed in writing before the order is confirmed.',
    ],
    specs: {
      caption: 'Typical specification ranges by origin — imported steam coal',
      head: ['Origin', 'Typical GCV', 'Ash', 'Total sulphur', 'Total moisture'],
      rows: [
        ['Indonesia', '4,200 – 5,800 kcal/kg GAR', '4 – 8%', '0.3 – 1.0%', '18 – 30%'],
        ['South Africa', '5,500 – 6,000 kcal/kg NAR', '12 – 17%', '0.6 – 1.0%', '8 – 10%'],
        ['Australia', '5,500 – 6,300 kcal/kg NAR', '10 – 15%', '0.4 – 0.8%', '9 – 12%'],
        ['United States', '5,900 – 6,400 kcal/kg NAR', '8 – 12%', '1.0 – 3.0%', '7 – 12%'],
      ],
    },
    origins: 'Sourced direct from established Indonesian, South African, Australian and US shippers.',
    lotSizes: 'Typical lots: 25,000 – 75,000 MT (handysize to panamax); part-cargo and recurring annual programmes supported.',
    delivery: EAST_COAST_PORTS,
    industries: ['power', 'cement', 'steel'],
    seoTitle: 'Imported Coal Supplier India — Indonesian, RB & Australian Steam Coal | K One Minerals',
    seoDescription:
      'Imported steam coal from Indonesia (4,200–5,800 GAR), South Africa, Australia and the US with load-port inspection and full documentation. Discharge at Krishnapatnam, Visakhapatnam, Gangavaram, Kakinada, Karaikal.',
  },
  {
    slug: 'limestone',
    name: 'Limestone',
    category: 'Minerals',
    blurb: 'Cement- and flux-grade limestone with verified CaO content and clean analysis.',
    description: [
      'Limestone supplied to cement, steel and chemical specifications, with chemical analysis verified before despatch and documented on every lot.',
      'Run-of-mine or sized material, scheduled to match your crusher and stockyard capacity.',
    ],
    specs: {
      caption: 'Typical specification ranges — cement / flux grade limestone',
      head: ['Property', 'Typical range'],
      rows: [
        ['CaO', '48 – 54%'],
        ['MgO', '≤ 3%'],
        ['SiO₂', '≤ 3.5%'],
        ['Al₂O₃ + Fe₂O₃', '≤ 2%'],
        ['Loss on ignition', '38 – 43%'],
        ['Size', '0 – 300 mm ROM, or 10 – 80 mm sized'],
      ],
    },
    origins: 'Sourced from vetted quarries in Telangana, Andhra Pradesh and Rajasthan.',
    lotSizes: 'Typical lots: 500 – 10,000 MT; recurring plant programmes supported.',
    delivery: 'Delivered by road or rail to plant gate; port handling available for coastal units.',
    industries: ['cement', 'steel'],
    seoTitle: 'Limestone Supplier — Cement & Flux Grade | K One Minerals',
    seoDescription:
      'Cement-grade and flux-grade limestone (CaO 48–54%) with verified chemical analysis, sized to order, delivered by road or rail across South India.',
  },
  {
    slug: 'dolomite',
    name: 'Dolomite',
    category: 'Minerals',
    blurb: 'SMS- and flux-grade dolomite for steelmaking, refractories and glass.',
    description: [
      'Dolomite supplied to metallurgical specification — MgO content, silica limits and sizing agreed up front and verified against analysis on every lot.',
    ],
    specs: {
      caption: 'Typical specification ranges — SMS / flux grade dolomite',
      head: ['Property', 'Typical range'],
      rows: [
        ['MgO', '18 – 22%'],
        ['CaO', '28 – 32%'],
        ['SiO₂', '≤ 4%'],
        ['Loss on ignition', '44 – 47%'],
        ['Size', '10 – 80 mm, or fines to order'],
      ],
    },
    origins: 'Sourced from established mines in Telangana, Chhattisgarh and Odisha.',
    lotSizes: 'Typical lots: 500 – 5,000 MT.',
    delivery: 'Delivered by road or rail to plant gate.',
    industries: ['steel', 'cement'],
    seoTitle: 'Dolomite Supplier — SMS & Flux Grade | K One Minerals',
    seoDescription:
      'SMS-grade dolomite (MgO 18–22%, SiO₂ ≤ 4%) for steel plants, refractories and glass, with per-lot chemical analysis and road/rail delivery.',
  },
  {
    slug: 'gypsum',
    name: 'Gypsum',
    category: 'Minerals',
    blurb: 'Mineral and imported gypsum for cement retardation and plaster products.',
    description: [
      'Natural and imported gypsum supplied against purity and moisture limits, with analysis documented per lot — the retarder your cement mill can dose with confidence.',
    ],
    specs: {
      caption: 'Typical specification ranges — cement grade gypsum',
      head: ['Property', 'Typical range'],
      rows: [
        ['Purity (CaSO₄·2H₂O)', '80 – 92%'],
        ['SO₃', '37 – 43%'],
        ['Free moisture', '≤ 8%'],
        ['Size', '0 – 50 mm'],
      ],
    },
    origins: 'Sourced from Rajasthan mineral gypsum and imported marine/FGD origins (Oman, Thailand).',
    lotSizes: 'Typical lots: 1,000 – 30,000 MT (imported part-cargoes supported).',
    delivery: EAST_COAST_PORTS,
    industries: ['cement'],
    seoTitle: 'Gypsum Supplier — Cement Grade Mineral & Imported | K One Minerals',
    seoDescription:
      'Cement-grade gypsum (purity 80–92%) from Rajasthan and imported origins, with per-lot analysis and delivery by road, rail or east-coast port discharge.',
  },
  {
    slug: 'iron-ore',
    name: 'Iron Ore',
    category: 'Minerals',
    blurb: 'Calibrated lump ore and fines to metallurgical specification.',
    description: [
      'Iron ore fines and calibrated lump ore supplied to your burden specification, with Fe content and gangue limits verified by third-party analysis before movement.',
    ],
    specs: {
      caption: 'Typical specification ranges — iron ore fines and CLO',
      head: ['Property', 'Typical range'],
      rows: [
        ['Fe', '58 – 65%'],
        ['SiO₂', '2 – 6%'],
        ['Al₂O₃', '2 – 4%'],
        ['Moisture', '≤ 8%'],
        ['Size', 'Fines 0 – 10 mm · CLO 5 – 18 mm'],
      ],
    },
    origins: 'Sourced from Odisha, Chhattisgarh and Karnataka mining regions through licensed channels.',
    lotSizes: 'Typical lots: 1,000 – 25,000 MT by rake or road.',
    delivery: 'Delivered by rail rake or road; port handling for coastal steel units.',
    industries: ['steel'],
    seoTitle: 'Iron Ore Supplier — Fines & Calibrated Lump Ore | K One Minerals',
    seoDescription:
      'Iron ore fines and CLO (Fe 58–65%) to metallurgical specification with third-party analysis, delivered by rake or road to steel plants.',
  },
  {
    slug: 'bauxite',
    name: 'Bauxite',
    category: 'Minerals',
    blurb: 'Metallurgical and refractory grade bauxite with controlled silica.',
    description: [
      'Bauxite supplied to alumina, cement and refractory specifications, with Al₂O₃ content and reactive silica limits verified per lot.',
    ],
    specs: {
      caption: 'Typical specification ranges — metallurgical grade bauxite',
      head: ['Property', 'Typical range'],
      rows: [
        ['Al₂O₃', '44 – 52%'],
        ['SiO₂', '2 – 5%'],
        ['Fe₂O₃', '15 – 25%'],
        ['Loss on ignition', '20 – 26%'],
        ['Size', '0 – 100 mm, crushed to order'],
      ],
    },
    origins: 'Sourced from Gujarat, Chhattisgarh and Odisha deposits.',
    lotSizes: 'Typical lots: 500 – 10,000 MT.',
    delivery: 'Delivered by road or rail; export/coastal movement supported.',
    industries: ['steel', 'cement'],
    seoTitle: 'Bauxite Supplier — Metallurgical & Refractory Grade | K One Minerals',
    seoDescription:
      'Metallurgical-grade bauxite (Al₂O₃ 44–52%, SiO₂ 2–5%) for alumina, cement and refractory applications, with per-lot analysis.',
  },
  {
    slug: 'silica-sand',
    name: 'Silica Sand',
    category: 'Minerals',
    blurb: 'High-purity graded silica sand for glass, foundry and construction.',
    description: [
      'Washed and graded silica sand supplied against purity and grain-size distribution requirements, with sieve analysis and chemistry documented per lot.',
    ],
    specs: {
      caption: 'Typical specification ranges — glass / foundry grade silica sand',
      head: ['Property', 'Typical range'],
      rows: [
        ['SiO₂', '96 – 99%'],
        ['Fe₂O₃', '≤ 0.5%'],
        ['Al₂O₃', '≤ 1.5%'],
        ['Moisture', '≤ 5%'],
        ['Grain size', '0.1 – 1.2 mm, graded fractions'],
      ],
    },
    origins: 'Sourced from processed deposits in Andhra Pradesh and Gujarat.',
    lotSizes: 'Typical lots: 200 – 5,000 MT.',
    delivery: 'Delivered bagged or in bulk by road.',
    industries: ['steel'],
    seoTitle: 'Silica Sand Supplier — Glass & Foundry Grade | K One Minerals',
    seoDescription:
      'High-purity silica sand (SiO₂ 96–99%, Fe₂O₃ ≤ 0.5%) in graded fractions for glass, foundry and construction, with sieve analysis per lot.',
  },
  {
    slug: 'fly-ash',
    name: 'Fly Ash',
    category: 'Minerals',
    blurb: 'Conforming fly ash for blended cement and concrete, tested to IS 3812.',
    description: [
      'Dry fly ash lifted from thermal stations and supplied to IS 3812 requirements, with fineness and LOI verified per consignment — a dependable stream for blended cement and ready-mix programmes.',
    ],
    specs: {
      caption: 'Typical specification ranges — fly ash (IS 3812 Part 1)',
      head: ['Property', 'Typical range'],
      rows: [
        ['Fineness (Blaine)', '≥ 320 m²/kg'],
        ['Loss on ignition', '≤ 5%'],
        ['SiO₂ + Al₂O₃ + Fe₂O₃', '≥ 70%'],
        ['Moisture', '≤ 2%'],
      ],
    },
    origins: 'Lifted from thermal power stations in Telangana and Andhra Pradesh under offtake arrangements.',
    lotSizes: 'Typical lots: bulker loads of 25 – 30 MT on recurring daily/weekly programmes.',
    delivery: 'Delivered by pneumatic bulker to silo.',
    industries: ['cement'],
    seoTitle: 'Fly Ash Supplier — IS 3812 for Blended Cement | K One Minerals',
    seoDescription:
      'Dry fly ash to IS 3812 (LOI ≤ 5%, fineness ≥ 320 m²/kg) on recurring bulker programmes for cement and ready-mix plants.',
  },
];

export const INDUSTRIES: Industry[] = [
  {
    slug: 'cement',
    name: 'Cement',
    blurb: 'The full input basket for clinker and grinding units — limestone, gypsum, fly ash and fuel.',
    description: [
      'A cement plant buys four things badly or well: limestone chemistry, gypsum purity, fly ash consistency and fuel cost per kcal. We supply all four against written specifications, with per-lot analysis, so the quality department signs off before the material moves.',
      'Fuel programmes cover domestic GCV-graded coal and imported steam coal with load-port inspection; mineral programmes are phased to crusher and silo capacity.',
    ],
    inputs: [
      { slug: 'limestone', role: 'Clinker raw feed with verified CaO and controlled MgO/SiO₂' },
      { slug: 'gypsum', role: 'Set retarder with documented purity per lot' },
      { slug: 'fly-ash', role: 'IS 3812 stream for blended cement, on recurring bulker programmes' },
      { slug: 'thermal-coal', role: 'Kiln and CPP fuel by GCV band' },
      { slug: 'imported-coal', role: 'Petcoke-alternative fuel programmes from seaborne origins' },
      { slug: 'bauxite', role: 'Alumina corrective for raw-mix design' },
    ],
    seoTitle: 'Raw Material Supply for Cement Plants — Limestone, Gypsum, Fly Ash, Coal | K One Minerals',
    seoDescription:
      'One accountable supplier for cement plant inputs: cement-grade limestone, gypsum, IS 3812 fly ash, and GCV-graded domestic and imported coal, with per-lot analysis.',
  },
  {
    slug: 'steel',
    name: 'Steel',
    blurb: 'Iron ore, dolomite and reductants supplied to demanding metallurgical specifications.',
    description: [
      'Steelmaking tolerates no surprises in its burden. We supply iron ore, fluxes and reductants against metallurgical specifications with third-party analysis on every lot, scheduled to your melt programme.',
    ],
    inputs: [
      { slug: 'iron-ore', role: 'Fines and CLO to burden specification (Fe 58–65%)' },
      { slug: 'dolomite', role: 'SMS-grade flux with controlled silica' },
      { slug: 'limestone', role: 'Flux-grade stone for BOF and sinter' },
      { slug: 'imported-coal', role: 'Reductant and fuel programmes from seaborne origins' },
      { slug: 'bauxite', role: 'Refractory and slag-conditioning grades' },
      { slug: 'silica-sand', role: 'Foundry-grade sand in controlled fractions' },
    ],
    seoTitle: 'Raw Material Supply for Steel Plants — Iron Ore, Dolomite, Coal | K One Minerals',
    seoDescription:
      'Metallurgical inputs for steelmaking: iron ore fines and CLO, SMS-grade dolomite, flux limestone and imported coal, with third-party analysis on every lot.',
  },
  {
    slug: 'power',
    name: 'Power Generation',
    blurb: 'Thermal and imported coal on dependable delivery schedules for uninterrupted generation.',
    description: [
      'Generation planning is fuel planning. We run coal programmes — domestic GCV-graded and imported — with laycans confirmed in writing, load-port inspection on every seaborne consignment, and rake schedules matched to stockyard days-of-cover.',
    ],
    inputs: [
      { slug: 'thermal-coal', role: 'Domestic steam coal by GCV band, rake-scheduled' },
      { slug: 'imported-coal', role: 'Blend-grade seaborne coal with load-port inspection' },
    ],
    seoTitle: 'Coal Supply for Power Plants — Domestic & Imported Programmes | K One Minerals',
    seoDescription:
      'Fuel programmes for power generation: domestic GCV-graded thermal coal and imported steam coal with written laycans, load-port inspection and full documentation.',
  },
];

export const productBySlug = (slug: string) => PRODUCTS.find((p) => p.slug === slug);
export const industryBySlug = (slug: string) => INDUSTRIES.find((i) => i.slug === slug);
