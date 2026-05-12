/**
 * Dummy vendor + service data — used for the public search experience.
 * 8 services × 5 vendors = 40 vendors.
 *
 * Images are stable Unsplash CDN URLs (no API key needed).
 */

export interface DummyService {
  id: string
  title: string
  price: number
  price_type: 'fixed' | 'per_hour' | 'per_visit' | 'per_sqft'
  description: string
  image: string
}

export interface DummyReview {
  id: string
  customer_name: string
  rating: number
  date: string
  comment: string
}

export interface DummyVendor {
  id: string
  service_slug: string          // 'carpentry' | 'electrical' | etc.
  service_label: string         // 'Carpentry'
  company_name: string
  owner_name: string
  avatar: string
  cover_image: string
  city: string
  area: string
  pincode: string
  phone: string
  email: string
  description: string
  tagline: string
  years_experience: number
  completed_jobs: number
  rating: number
  review_count: number
  starting_price: number        // min price in INR
  response_time: string         // "within 30 min"
  availability: string          // "Available today"
  kyc_verified: boolean
  top_rated: boolean
  badges: string[]              // ['Verified','Top Rated','5+ Years']
  specialties: string[]
  services: DummyService[]
  portfolio: { id: string; title: string; image: string; description: string }[]
  reviews: DummyReview[]
  languages: string[]
  service_areas: string[]
}

export interface ServiceCategory {
  slug: string
  label: string
  icon: string            // emoji fallback (cards use real images)
  hero_image: string
  description: string
  short_desc: string
  starting_price: number
}

/* ─────────── Service catalog ─────────── */
export const SERVICE_CATEGORIES: ServiceCategory[] = [
  {
    slug: 'carpentry',
    label: 'Carpentry',
    icon: '🪚',
    hero_image: 'https://images.unsplash.com/photo-1601058268499-e52658b8bb88?w=1200&h=400&fit=crop',
    description: 'From bespoke furniture to custom built-ins, our verified carpenters bring decades of woodworking craftsmanship to your home.',
    short_desc: 'Custom furniture, modular wardrobes, repairs & restorations',
    starting_price: 499,
  },
  {
    slug: 'electrical',
    label: 'Electrical',
    icon: '⚡',
    hero_image: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=1200&h=400&fit=crop',
    description: 'Licensed electricians for safe installations, repairs, smart-home wiring and emergency call-outs.',
    short_desc: 'Wiring, switches, fans, lights, MCB, smart home',
    starting_price: 299,
  },
  {
    slug: 'plumbing',
    label: 'Plumbing',
    icon: '🚿',
    hero_image: 'https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=1200&h=400&fit=crop',
    description: 'Leaks, blocked drains, bathroom fittings & full plumbing overhauls — handled by certified pros.',
    short_desc: 'Leak repair, tap & drain fixes, bathroom fittings',
    starting_price: 349,
  },
  {
    slug: 'painting',
    label: 'Painting',
    icon: '🎨',
    hero_image: 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=1200&h=400&fit=crop',
    description: 'Interior & exterior painting using premium emulsions — including texture, waterproofing and wallpaper.',
    short_desc: 'Interior, exterior, texture, waterproofing',
    starting_price: 18,
  },
  {
    slug: 'home-renovation',
    label: 'Home Renovation',
    icon: '🏗️',
    hero_image: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1200&h=400&fit=crop',
    description: 'End-to-end home makeovers — design, demolition, civil, electrical, plumbing and finishing.',
    short_desc: 'Full home, kitchen & bathroom renovation',
    starting_price: 49999,
  },
  {
    slug: 'cleaning',
    label: 'Cleaning',
    icon: '🧹',
    hero_image: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1200&h=400&fit=crop',
    description: 'Deep cleaning, sofa shampoo, kitchen degreasing and move-in/move-out specialists.',
    short_desc: 'Deep cleaning, sofa, kitchen, move-in/out',
    starting_price: 999,
  },
  {
    slug: 'interior-design',
    label: 'Interior Design',
    icon: '🛋️',
    hero_image: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1200&h=400&fit=crop',
    description: 'Award-winning interior designers crafting modern, minimalist and luxury spaces tailored to your taste.',
    short_desc: 'Modular kitchens, wardrobes, full home styling',
    starting_price: 5999,
  },
  {
    slug: 'home-repair',
    label: 'Home Repair',
    icon: '🔧',
    hero_image: 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=1200&h=400&fit=crop',
    description: 'Drilling, mounting, drywall, hinge fixes, door alignment and the everything-else handyman fixes.',
    short_desc: 'TV mounting, drilling, hinges, doors, handyman',
    starting_price: 199,
  },
]

/* ─────────── Helpers to build realistic vendors ─────────── */

const FACES = [
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?w=200&h=200&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=200&h=200&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=200&h=200&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200&h=200&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face',
]

const AREAS = ['RS Puram', 'Saibaba Colony', 'Peelamedu', 'Race Course', 'Singanallur', 'Gandhipuram', 'Vadavalli', 'Saravanampatti', 'Avinashi Road', 'Town Hall']

const REVIEWERS = [
  'Anitha Krishnan', 'Suresh Kumar', 'Priya Ramesh', 'Vikram Iyer', 'Lakshmi Narayanan',
  'Rajesh Babu', 'Divya Subramanian', 'Karthik Rao', 'Meera Pillai', 'Aditya Sharma',
]

const REVIEW_TEMPLATES: Record<string, string[]> = {
  carpentry: [
    'Built a stunning floor-to-ceiling wardrobe for our master bedroom. The finish is flawless and they finished a day early.',
    'Repaired and refinished our old dining table — it looks brand new. Very polite team and fair pricing.',
    'Custom TV unit turned out exactly like the mood-board. Clean workmanship and good quality plywood.',
  ],
  electrical: [
    'Diagnosed a long-standing flickering light issue in 10 minutes. Honest pricing, no upselling.',
    'Full house re-wiring during our renovation — neat work and proper certified materials throughout.',
    'Installed ceiling fans and smart switches across 3 rooms. Cleanly done and explained everything.',
  ],
  plumbing: [
    'Fixed a hidden bathroom leak that two other plumbers missed. Saved us from major water damage.',
    'Replaced the entire kitchen sink and faucet — clean job, took just an hour.',
    'Bathroom retiling and pipe replacement done end-to-end. Very tidy crew, left site spotless.',
  ],
  painting: [
    'Painted our 3BHK in 4 days. Excellent surface prep, no drips, no mess. Highly recommend.',
    'Beautiful texture work on the feature wall — exactly the moody finish we wanted.',
    'Waterproofed our terrace before monsoon and not a single leak this season. Worth every rupee.',
  ],
  'home-renovation': [
    'They handled our full kitchen renovation — design to handover in 6 weeks, on budget, no surprises.',
    'Converted a balcony into a study nook. Beautiful design choices and proper civil work.',
    'Bathroom completely gutted and rebuilt with luxury finishes. Lead designer was very responsive.',
  ],
  cleaning: [
    'Pre-Diwali deep clean — house has never looked or smelled this fresh. Crew of 4 finished a 2BHK in 5 hours.',
    'Sofa & mattress shampoo removed stains we thought were permanent. Will book again.',
    'Move-in cleaning for our new flat — every corner was scrubbed. Worth the price.',
  ],
  'interior-design': [
    'Designed our entire living + dining area. Used the space cleverly and stuck to our budget.',
    'Modular kitchen turned out gorgeous — soft-close drawers, tall units, the works.',
    'Loved how they translated our Pinterest board into a real, liveable space.',
  ],
  'home-repair': [
    'Mounted a 65" TV, fixed two squeaky doors and re-hung curtain rods in one visit. Brilliant.',
    'Drilled and installed new shelves perfectly level — even matched the wall paint after.',
    'Came out same-day for a broken cabinet hinge. Quick, polite, fair priced.',
  ],
}

const PORTFOLIO_IMAGES: Record<string, string[]> = {
  carpentry: [
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1556228724-4d2cbd9e2c0a?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1556909114-44e3e9399a2c?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1503602642458-232111445657?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1530603907829-659ab6ed369f?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=600&h=600&fit=crop',
  ],
  electrical: [
    'https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1558002038-1055907df827?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1565608438257-fac3c27beb36?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1581094288338-2314dddb7ece?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1565538810643-b5bdb714032a?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1563453392212-326f5e854473?w=600&h=600&fit=crop',
  ],
  plumbing: [
    'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1620626011761-996317b8d101?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1591348278863-a8fb3887e2aa?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1604754742629-3e5728249d73?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1564540583246-934409427776?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1552242718-c5360894aecd?w=600&h=600&fit=crop',
  ],
  painting: [
    'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1572177812156-58036aae439c?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1581858726788-75bc0f6a952d?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1604769861514-7d33e6e30c91?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1599619351208-3e6c839d6828?w=600&h=600&fit=crop',
  ],
  'home-renovation': [
    'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=600&h=600&fit=crop',
  ],
  cleaning: [
    'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1581578017093-cd30fce4eeb7?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1563453392212-326f5e854473?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1556909114-44e3e9399a2c?w=600&h=600&fit=crop',
  ],
  'interior-design': [
    'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1615874959474-d609969a20ed?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1567016376408-0226e4d0c1ea?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?w=600&h=600&fit=crop',
  ],
  'home-repair': [
    'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1572177812156-58036aae439c?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1565538810643-b5bdb714032a?w=600&h=600&fit=crop',
    'https://images.unsplash.com/photo-1581094288338-2314dddb7ece?w=600&h=600&fit=crop',
  ],
}

const SERVICE_BLUEPRINTS: Record<string, { title: string; price: number; price_type: DummyService['price_type']; description: string }[]> = {
  carpentry: [
    { title: 'Custom Wardrobe Build', price: 1899, price_type: 'per_sqft', description: 'Floor-to-ceiling modular wardrobe with soft-close hinges, premium laminates and internal lighting.' },
    { title: 'TV Unit / Wall Panelling', price: 24999, price_type: 'fixed', description: 'Designer wall-mounted TV unit with storage and integrated LED strip lighting.' },
    { title: 'Furniture Repair & Polish', price: 599, price_type: 'per_hour', description: 'Re-polish, re-cane, hinge repair and structural fixes for old furniture.' },
    { title: 'Modular Kitchen Cabinets', price: 1650, price_type: 'per_sqft', description: 'Tall units, drawer units and overhead cabinets with quartz/granite top installation.' },
  ],
  electrical: [
    { title: 'Switch / Socket Replacement', price: 199, price_type: 'fixed', description: 'Per-point replacement of switches, sockets and dimmers. Materials extra.' },
    { title: 'Ceiling Fan Installation', price: 449, price_type: 'fixed', description: 'Hanging, wiring and regulator setup for any standard ceiling fan.' },
    { title: 'Full House Wiring', price: 65, price_type: 'per_sqft', description: 'ISI-marked copper wiring, MCBs, distribution box and earthing.' },
    { title: 'Smart Home Setup', price: 5999, price_type: 'fixed', description: 'Smart switches, motion sensors and voice assistant integration.' },
  ],
  plumbing: [
    { title: 'Tap / Faucet Replacement', price: 349, price_type: 'fixed', description: 'Replace mixers, hot-cold taps and sensor faucets.' },
    { title: 'Drain Unblocking', price: 599, price_type: 'fixed', description: 'High-pressure cleaning for blocked sinks, washbasins and floor traps.' },
    { title: 'Leak Detection & Repair', price: 699, price_type: 'per_visit', description: 'Thermal scan for hidden wall and ceiling leaks. Sealing and re-tiling extra.' },
    { title: 'Bathroom Fitting Install', price: 4999, price_type: 'fixed', description: 'Wash basin, WC, health faucet, shower, geyser fitting end-to-end.' },
  ],
  painting: [
    { title: 'Interior Emulsion Painting', price: 18, price_type: 'per_sqft', description: 'Premium emulsion, 2 coats including putty, primer and finishing.' },
    { title: 'Exterior Weatherproof Paint', price: 26, price_type: 'per_sqft', description: 'Weather-shield paint with 7-year warranty including primer.' },
    { title: 'Texture / Feature Wall', price: 95, price_type: 'per_sqft', description: 'Decorative texture, stencil and metallic finishes for accent walls.' },
    { title: 'Terrace Waterproofing', price: 42, price_type: 'per_sqft', description: 'Multi-layer waterproofing with elastomeric coating, 5-year warranty.' },
  ],
  'home-renovation': [
    { title: 'Full Home Renovation', price: 1499, price_type: 'per_sqft', description: 'Civil, electrical, plumbing, false ceiling and finishing — turnkey.' },
    { title: 'Modular Kitchen Renovation', price: 149999, price_type: 'fixed', description: 'Design + execution. Cabinets, countertop, chimney, hob and lighting.' },
    { title: 'Bathroom Renovation', price: 89999, price_type: 'fixed', description: 'Tear-out and rebuild with new tiles, fittings, false ceiling and exhaust.' },
    { title: 'False Ceiling & POP Work', price: 75, price_type: 'per_sqft', description: 'Gypsum & POP false ceiling with cove lighting and modern profiles.' },
  ],
  cleaning: [
    { title: 'Deep Cleaning - 2BHK', price: 2999, price_type: 'fixed', description: 'Bathrooms, kitchen, floors, fans, switches and windows. 4-person crew.' },
    { title: 'Sofa & Carpet Shampoo', price: 1499, price_type: 'fixed', description: 'Steam + shampoo for 5-seater sofa or comparable carpet area.' },
    { title: 'Kitchen Deep Clean', price: 1299, price_type: 'fixed', description: 'Chimney degrease, slab polish, cabinet wipe-down and floor scrub.' },
    { title: 'Move-in / Move-out Clean', price: 4999, price_type: 'fixed', description: 'Full empty-property scrub for handover or move-in.' },
  ],
  'interior-design': [
    { title: 'Full Home Interior Design', price: 199, price_type: 'per_sqft', description: 'Concept, 3D visualisation, material selection and execution oversight.' },
    { title: 'Modular Kitchen Design', price: 75999, price_type: 'fixed', description: 'Layout, 3D render, material board and on-site supervision.' },
    { title: 'Living Room Makeover', price: 49999, price_type: 'fixed', description: 'Furniture, lighting, wall treatment and accessories curated for your taste.' },
    { title: 'Consultation & 3D Render', price: 5999, price_type: 'per_visit', description: 'Site visit, mood-boarding and a single-room 3D render to scale.' },
  ],
  'home-repair': [
    { title: 'TV Wall Mounting', price: 599, price_type: 'fixed', description: 'Up to 65" TV. Brackets included. Cable management extra.' },
    { title: 'Door & Window Repair', price: 449, price_type: 'per_visit', description: 'Hinge fix, alignment, lock change and weather sealing.' },
    { title: 'Drilling & Mounting', price: 199, price_type: 'fixed', description: 'Per-hole drilling for shelves, paintings, curtain rods, mirrors.' },
    { title: 'Handyman Hour', price: 499, price_type: 'per_hour', description: 'Hourly handyman for a punch-list of small fixes around the home.' },
  ],
}

const VENDOR_NAME_POOL: Record<string, { company: string; owner: string }[]> = {
  carpentry: [
    { company: 'WoodCraft Studios', owner: 'Murugan Selvam' },
    { company: 'TimberLine Interiors', owner: 'Rakesh Pillai' },
    { company: 'Heritage Carpentry Co.', owner: 'Mahesh Iyer' },
    { company: 'Saw & Plane Works', owner: 'Karthik Mohan' },
    { company: 'Coimbatore Wood Co.', owner: 'Senthil Velan' },
  ],
  electrical: [
    { company: 'Voltline Electricals', owner: 'Arun Prakash' },
    { company: 'PowerSure Services', owner: 'Manoj Krishnan' },
    { company: 'BrightHome Electric', owner: 'Vinoth Kumar' },
    { company: 'Sparx & Co. Electricals', owner: 'Dinesh Babu' },
    { company: 'Kovai Electric Works', owner: 'Hari Prasad' },
  ],
  plumbing: [
    { company: 'AquaFix Plumbing', owner: 'Sundar Raj' },
    { company: 'PipeLine Pros', owner: 'Bala Subramaniam' },
    { company: 'LeakBusters Coimbatore', owner: 'Ganesh Kumar' },
    { company: 'BlueFlow Plumbers', owner: 'Ravi Shankar' },
    { company: 'TapMaster Services', owner: 'Vijay Anand' },
  ],
  painting: [
    { company: 'ColourCraft Painters', owner: 'Naveen Raghu' },
    { company: 'BrushStroke Pro', owner: 'Prakash Suresh' },
    { company: 'Hue & Co. Painting', owner: 'Anand Krishnan' },
    { company: 'PerfectFinish Paints', owner: 'Mohan Das' },
    { company: 'Kovai Painting Works', owner: 'Sathish Babu' },
  ],
  'home-renovation': [
    { company: 'BuildRight Renovations', owner: 'Ashok Venkatesh' },
    { company: 'Reform Home Studios', owner: 'Rohit Nair' },
    { company: 'GroundUp Builders', owner: 'Karthik Ramanathan' },
    { company: 'Renovate.Co Coimbatore', owner: 'Siddharth Iyer' },
    { company: 'Modern Home Makers', owner: 'Pradeep Chandran' },
  ],
  cleaning: [
    { company: 'SparkleClean Services', owner: 'Lakshmi Devi' },
    { company: 'FreshHome Cleaning', owner: 'Priyanka Raghav' },
    { company: 'PristineCare Coimbatore', owner: 'Deepika Suresh' },
    { company: 'MaxWell Agency', owner: 'Janani Kumar' },
    { company: 'PureSpace Cleaners', owner: 'Revathi Nair' },
  ],
  'interior-design': [
    { company: 'Studio Vayana Interiors', owner: 'Aishwarya Menon' },
    { company: 'Living Space Design Co.', owner: 'Kabir Rajan' },
    { company: 'Kovai Design Atelier', owner: 'Nandini Iyer' },
    { company: 'Curve & Line Studio', owner: 'Rohan Varma' },
    { company: 'Inhabit Interiors', owner: 'Shalini Murugan' },
  ],
  'home-repair': [
    { company: 'Fixit Express', owner: 'Manikandan R.' },
    { company: 'Handyman Heroes', owner: 'Sathya Narayan' },
    { company: 'QuickFix Coimbatore', owner: 'Vignesh Babu' },
    { company: 'Home Genie Services', owner: 'Rajiv Anand' },
    { company: 'AllFix Solutions', owner: 'Suresh Pandian' },
  ],
}

const TAGLINES: Record<string, string[]> = {
  carpentry: [
    'Crafting custom woodwork since 2009',
    'Where wood meets design',
    '20+ years of carpentry mastery',
    'Modular & bespoke woodwork specialists',
    'Heirloom-quality furniture, on-time delivery',
  ],
  electrical: [
    'Licensed, insured, certified electricians',
    'Safe wiring. Smart homes. Honest pricing.',
    '24/7 emergency electrical service',
    'From a single switch to a full rewire',
    'Powering Coimbatore homes since 2012',
  ],
  plumbing: [
    'Leak today, fixed today',
    'Plumbing pros with a 1-year workmanship warranty',
    'No call-out fee, no hidden surprises',
    'Bathroom & kitchen specialists',
    '15+ years stopping leaks across Coimbatore',
  ],
  painting: [
    'Premium emulsion. Spotless finish.',
    'Painters who care about the small stuff',
    'Asian Paints / Berger certified team',
    'Painted 500+ homes across Tamil Nadu',
    'Texture, waterproofing, wallpapering experts',
  ],
  'home-renovation': [
    'From blueprint to handover, on budget',
    'Award-winning home renovation studio',
    'Design-build experts for full home makeovers',
    'Kitchen & bathroom transformation specialists',
    'Turnkey renovations with weekly progress reports',
  ],
  cleaning: [
    'Eco-friendly deep cleaning experts',
    'Crew of 4. Done in half a day.',
    'Pre-Diwali specialists since 2014',
    'Hospital-grade disinfection included',
    '100% satisfaction or we re-clean free',
  ],
  'interior-design': [
    'Designed homes featured in BHG & ELLE Decor',
    'Modern, minimalist, made for you',
    'Award-winning interior design studio',
    '3D visualisation before a single nail goes in',
    'Curating beautiful, liveable spaces since 2015',
  ],
  'home-repair': [
    'The fix-anything handyman team',
    'Same-day service across Coimbatore',
    'Mount, drill, repair — done right',
    'No job too small. Flat-rate pricing.',
    'The handyman service homeowners trust',
  ],
}

/* ─────────── Build ─────────── */
function buildVendor(
  service: ServiceCategory,
  index: number
): DummyVendor {
  const pool = VENDOR_NAME_POOL[service.slug][index]
  const taglines = TAGLINES[service.slug]
  const blueprints = SERVICE_BLUEPRINTS[service.slug]
  const portfolios = PORTFOLIO_IMAGES[service.slug]
  const reviewTpl = REVIEW_TEMPLATES[service.slug]

  const yrs = [4, 7, 11, 15, 22][index]
  const jobs = [120, 340, 580, 920, 1450][index]
  const rating = [4.5, 4.7, 4.8, 4.9, 4.6][index]
  const reviewCount = [38, 96, 142, 218, 87][index]
  const startingPrice = Math.max(...blueprints.map(b => b.price_type === 'per_sqft' || b.price_type === 'per_hour' ? b.price : 0), service.starting_price)

  const services: DummyService[] = blueprints.map((b, i) => ({
    id: `${service.slug}-${index}-svc-${i}`,
    title: b.title,
    price: b.price,
    price_type: b.price_type,
    description: b.description,
    image: portfolios[i % portfolios.length],
  }))

  const portfolio = portfolios.slice(0, 6).map((img, i) => ({
    id: `${service.slug}-${index}-pf-${i}`,
    title: `${blueprints[i % blueprints.length].title} — Project ${i + 1}`,
    image: img,
    description: 'Completed project for a happy customer in Coimbatore.',
  }))

  const reviews: DummyReview[] = REVIEWERS.slice(0, 6).map((name, i) => ({
    id: `${service.slug}-${index}-rv-${i}`,
    customer_name: name,
    rating: i < 2 ? 5 : i < 4 ? rating : Math.max(4, Math.floor(rating)),
    date: ['2 days ago', '1 week ago', '3 weeks ago', '1 month ago', '2 months ago', '3 months ago'][i],
    comment: reviewTpl[i % reviewTpl.length],
  }))

  return {
    id: `${service.slug}-${index + 1}`,
    service_slug: service.slug,
    service_label: service.label,
    company_name: pool.company,
    owner_name: pool.owner,
    avatar: FACES[(service.slug.length + index) % FACES.length],
    cover_image: service.hero_image,
    city: 'Coimbatore',
    area: AREAS[(index * 2 + service.slug.length) % AREAS.length],
    pincode: ['641001', '641004', '641012', '641028', '641035'][index],
    phone: `+91 9${(7000000000 + Math.floor(Math.random() * 999999999))}`,
    email: `${pool.company.toLowerCase().replace(/[^a-z]/g, '')}@vayil.in`,
    description: `${pool.company} is a ${yrs}-year veteran ${service.label.toLowerCase()} business based in Coimbatore. We've completed over ${jobs} projects with a focus on craftsmanship, transparent pricing and after-service support.`,
    tagline: taglines[index],
    years_experience: yrs,
    completed_jobs: jobs,
    rating,
    review_count: reviewCount,
    starting_price: startingPrice,
    response_time: ['within 15 min', 'within 30 min', 'within 1 hour', 'within 2 hours', 'within 30 min'][index],
    availability: ['Available today', 'Available tomorrow', 'Available today', 'Available this week', 'Available today'][index],
    kyc_verified: true,
    top_rated: index >= 2,
    badges: [
      'Verified',
      ...(index >= 2 ? ['Top Rated'] : []),
      `${yrs}+ Years`,
      ...(jobs >= 500 ? ['500+ Jobs'] : []),
    ],
    specialties: blueprints.slice(0, 3).map(b => b.title),
    services,
    portfolio,
    reviews,
    languages: ['English', 'Tamil', ...(index % 2 === 0 ? ['Hindi'] : [])],
    service_areas: ['Coimbatore', 'Tiruppur', ...(index >= 3 ? ['Pollachi', 'Mettupalayam'] : [])],
  }
}

export const DUMMY_VENDORS: DummyVendor[] = SERVICE_CATEGORIES.flatMap(cat =>
  [0, 1, 2, 3, 4].map(i => buildVendor(cat, i))
)

/* ─────────── Lookups ─────────── */
export function getVendorById(id: string): DummyVendor | undefined {
  return DUMMY_VENDORS.find(v => v.id === id)
}

export function getVendorsByService(slug: string): DummyVendor[] {
  return DUMMY_VENDORS.filter(v => v.service_slug === slug)
}

export function getServiceBySlug(slug: string): ServiceCategory | undefined {
  return SERVICE_CATEGORIES.find(c => c.slug === slug)
}

export function searchVendors(query: string): DummyVendor[] {
  const q = query.trim().toLowerCase()
  if (!q) return DUMMY_VENDORS
  return DUMMY_VENDORS.filter(v =>
    v.company_name.toLowerCase().includes(q) ||
    v.service_label.toLowerCase().includes(q) ||
    v.service_slug.toLowerCase().includes(q) ||
    v.specialties.some(s => s.toLowerCase().includes(q)) ||
    v.services.some(s => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)) ||
    v.tagline.toLowerCase().includes(q)
  )
}
