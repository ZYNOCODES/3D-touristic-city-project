export const SPECIFICATIONS = [
  {
    title: 'Structure & Finishes',
    items: [
      ['Structure', 'Reinforced concrete frame on engineered terraces, seismic zone IV compliant'],
      ['Ceiling heights', '3.2 m living areas, 6.4 m double-height lounge'],
      ['Glazing', 'Floor-to-ceiling low-E laminated glass, lift-and-slide pocket doors'],
      ['Flooring', 'Large-format honed limestone porcelain, oak in bedrooms'],
      ['Joinery', 'Rift-sawn oak slat feature walls, cantilevered oak stair treads'],
      ['Kitchen', 'Calacatta stone island, integrated appliances, walk-in pantry'],
    ],
  },
  {
    title: 'MEP & Smart Systems',
    items: [
      ['Climate', 'VRF inverter A/C with zoned smart thermostats, ceiling fans'],
      ['Energy', '12 kWp rooftop solar, 20 kWh battery storage, EV-ready parking'],
      ['Water', 'Rainwater harvesting, solar water heating, filtered drinking water'],
      ['Home automation', 'Lighting scenes, motorised blinds, pool & access control via app'],
      ['Connectivity', 'Fibre to the home, mesh Wi-Fi, prewired AV in living areas'],
      ['Security', '24/7 gated access, CCTV perimeter, smart locks'],
    ],
  },
  {
    title: 'Outdoor & Amenities',
    items: [
      ['Private pool', 'Infinity-edge plunge pool with heat pump & LED lighting'],
      ['Terraces', 'Thermo-ash decking, covered outdoor lounge, BBQ station'],
      ['Landscaping', 'Olive, cypress, pine and lavender planting, drip irrigation, garden lighting'],
      ['Community', 'Pool deck, sports court, playground, social lounge, beach club'],
      ['Services', 'Optional rental programme, concierge & housekeeping'],
    ],
  },
] as const

export const GALLERY = {
  villa: [
    { src: 'renders/villa_living.jpg', caption: 'Living room with stone fireplace' },
    { src: 'renders/villa_terrace.jpg', caption: 'Covered terrace & private pool' },
    { src: 'renders/villa_dining.jpg', caption: 'Dining & kitchen' },
    { src: 'renders/villa_bedroom.jpg', caption: 'Master suite' },
    { src: 'renders/exterior.jpg', caption: 'Villa exterior' },
  ],
  apartment: [
    { src: 'renders/apt_living.jpg', caption: 'Living room facing the bay' },
    { src: 'renders/apt_kitchen.jpg', caption: 'Kitchen & dining' },
    { src: 'renders/apt_bedroom.jpg', caption: 'Bedroom behind the glass partition' },
  ],
}
