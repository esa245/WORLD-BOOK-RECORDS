export type BookCategory = 'Fiction' | 'History' | 'Science';
export type BookAccessType = 'Free' | 'Paid';
export type BookCoverVariant = 'c1' | 'c2' | 'c3' | 'c4';
export type BookModerationStatus = 'pending' | 'approved' | 'rejected';

export interface BookItem {
  id: string;
  userId?: string;
  titleLines: [string, string];
  title: string;
  author: string;
  category: BookCategory;
  type: BookAccessType;
  priceLabel: string;
  coverImageUrl?: string;
  bookFileUrl?: string;
  bookFileName?: string;
  bookFileSize?: string;
  coverVariant: BookCoverVariant;
  coverKicker: string;
  coverFooter: string;
  pages: number;
  publishedYear: number;
  synopsis: string;
  excerpt: string;
  status?: BookModerationStatus;
  rejectionReason?: string;
}

export interface AuthorItem {
  id: string;
  initials: string;
  name: string;
  verified: boolean;
  country: string;
  genre: string;
  publishedCount: number;
  bio: string;
}

export interface MilestoneRecord {
  number: string;
  title: string;
  description: string;
}

export interface InfoPageItem {
  key: 'about' | 'guidelines' | 'copyright' | 'contact';
  label: string;
  title: string;
  body: string;
}

export const INITIAL_BOOKS: BookItem[] = [
  {
    id: 'silent-empire',
    titleLines: ['The Silent', 'Empire'],
    title: 'The Silent Empire',
    author: 'Aria Sen',
    category: 'Fiction',
    type: 'Paid',
    priceLabel: '$4.99',
    coverVariant: 'c1',
    coverKicker: 'WORLD BOOK RECORDS',
    coverFooter: 'A NOVEL BY ARIA SEN',
    pages: 312,
    publishedYear: 2026,
    synopsis:
      'Set across coastal archives and forgotten observatories, a cartographer uncovers an unwritten history preserved only in marginalia.',
    excerpt:
      'In the hour before tide-fall, the stone library kept its own silence—not an absence of sound, but a patience earned over four centuries of salt and ink.\n\nAlong the northern gallery, wooden drawers held sea charts drawn before the harbor walls existed. Their margins carried cramped notes in faded iron-gall ink: dates of eclipses, names of lost vessels, and quiet warnings from archivists who knew no king would read that far.\n\nMira traced the coastline with her sleeve pulled back from the vellum. Where the modern maps showed empty water, an older hand had inked three tiny crescents and a single word: Listen.',
  },
  {
    id: 'rivers-of-memory',
    titleLines: ['Rivers of', 'Memory'],
    title: 'Rivers of Memory',
    author: 'Rahman Kabir',
    category: 'History',
    type: 'Free',
    priceLabel: 'Free',
    coverVariant: 'c2',
    coverKicker: 'AN OPEN HISTORY',
    coverFooter: 'BY RAHMAN KABIR',
    pages: 248,
    publishedYear: 2025,
    synopsis:
      'An open-access chronicle tracing delta trade routes, oral poetry, and riverine towns that shaped centuries of South Asian scholarship.',
    excerpt:
      'Every ferry crossing carried more than timber and grain; it carried dialects, letters stitched into cloth, and songs tuned to the monsoon.\n\nWhen the rivers shifted course each August, whole markets lifted their bamboo frames and followed the water. Yet the stories stayed anchored to names of bends and sandbars that still survive in folk couplets recited three hundred years later.\n\nTo read the delta properly is to read sideways across paper and tide alike—listening to boatmen, weavers, and village scribes who preserved history without marble monuments.',
  },
  {
    id: 'beyond-the-stars',
    titleLines: ['Beyond', 'the Stars'],
    title: 'Beyond the Stars',
    author: 'Maya Fern',
    category: 'Science',
    type: 'Paid',
    priceLabel: '$7.00',
    coverVariant: 'c3',
    coverKicker: 'IDEAS FOR TOMORROW',
    coverFooter: 'BY MAYA FERN',
    pages: 284,
    publishedYear: 2026,
    synopsis:
      'An accessible journey through deep-space spectroscopy, exoplanet atmospheres, and the human instruments built to listen across light-years.',
    excerpt:
      'A single slit of starlight, split across prism glass, still holds the oldest chemistry lesson in the universe: what worlds are made of, and what they might yet host.\n\nLong before spacecraft left Earth’s gravity well, astronomers learned to weigh distant suns simply by noticing where dark hairlines interrupted a rainbow. Each missing sliver of color is an atomic fingerprint—sodium, iron, water vapor, or methane—carried faithfully across unimaginable emptiness.\n\nToday, those same dark lines tell us when light has passed through the thin blue rim of an alien sky.',
  },
  {
    id: 'garden-of-small-things',
    titleLines: ['Garden of', 'Small Things'],
    title: 'Garden of Small Things',
    author: 'Elias Morgan',
    category: 'Fiction',
    type: 'Free',
    priceLabel: 'Free',
    coverVariant: 'c4',
    coverKicker: 'A COLLECTION',
    coverFooter: 'BY ELIAS MORGAN',
    pages: 176,
    publishedYear: 2025,
    synopsis:
      'Twelve linked short stories about botanists, letter-writers, and night-shift bakers tending quiet corners of a changing city.',
    excerpt:
      'He labeled each clay pot not with Latin taxonomy, but with the name of the friend who had carried the cutting across town in a coat pocket.\n\nThere was rosemary from Hannah’s third-floor fire escape, mint that survived two winters behind the bakery vent, and a stubborn fig sapling wrapped in Tuesday’s newspaper. By June, the narrow rooftop smelled like six different neighborhoods talking at once.\n\nNeighbors who rarely shared more than an elevator nod began arriving at dusk with empty jars, trading patience for green shoots.',
  },
];

export const AUTHORS: AuthorItem[] = [
  {
    id: 'aria-sen',
    initials: 'AS',
    name: 'Aria Sen',
    verified: true,
    country: 'India',
    genre: 'Fiction & Poetry',
    publishedCount: 12,
    bio: 'Novelist and essayist exploring memory, maritime archives, and lyrical contemporary fiction.',
  },
  {
    id: 'rahman-kabir',
    initials: 'RK',
    name: 'Rahman Kabir',
    verified: false,
    country: 'Bangladesh',
    genre: 'History',
    publishedCount: 8,
    bio: 'Historian dedicated to open-access regional archives, riverine heritage, and oral historiography.',
  },
  {
    id: 'maya-fern',
    initials: 'MF',
    name: 'Maya Fern',
    verified: false,
    country: 'United Kingdom',
    genre: 'Science',
    publishedCount: 5,
    bio: 'Astrophysics communicator writing clear, evocative books on cosmology and observational science.',
  },
  {
    id: 'elias-morgan',
    initials: 'EM',
    name: 'Elias Morgan',
    verified: false,
    country: 'Canada',
    genre: 'Fiction',
    publishedCount: 4,
    bio: 'Short-story author focused on everyday resilience, urban gardens, and quiet human connections.',
  },
];

export const LITERARY_RECORDS: MilestoneRecord[] = [
  {
    number: '01',
    title: 'Most Published Works',
    description: 'Celebrate authors with an exceptional body of published work.',
  },
  {
    number: '02',
    title: 'Reader Choice',
    description: 'Highlight books loved by readers across countries and cultures.',
  },
  {
    number: '03',
    title: 'Young Literary Voice',
    description: 'Recognise emerging writers and promising new perspectives.',
  },
];

export const INFO_PAGES: InfoPageItem[] = [
  {
    key: 'about',
    label: 'About',
    title: 'About World Book Records',
    body: 'World Book Records is a global literary platform uniting independent authors, open-access scholars, and dedicated readers. Every published work contributes to a living record of human storytelling.',
  },
  {
    key: 'guidelines',
    label: 'Guidelines',
    title: 'Publishing & Record Guidelines',
    body: 'Authors may publish original fiction, history, science, or poetry under free open-reading access or paid editions. Literary milestone records undergo editorial review prior to verification.',
  },
  {
    key: 'copyright',
    label: 'Copyright',
    title: 'Author Rights & Copyright',
    body: 'Authors retain full intellectual property rights over every manuscript shared on World Book Records. Readers agree to respect individual edition licenses and attribution terms.',
  },
  {
    key: 'contact',
    label: 'Contact',
    title: 'Editorial & Community Desk',
    body: 'For literary record submissions, verification inquiries, or author support, reach the editorial desk at hello@worldbookrecords.org.',
  },
];
