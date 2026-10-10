// The six starting points offered at sign-up. Each sets up stages, job types and the job form,
// all of which can be changed later in Settings. Keys match seed_profile() in the database.
export type Profile = {
  key: "creative" | "photo" | "trades" | "events" | "content" | "personal";
  title: string;
  who: string;
  stages: string[];
  clients: boolean; // whether clients usually log in to send requests
  workspace: (first: string) => string;
};

export const PROFILES: Profile[] = [
  {
    key: "creative",
    title: "Creative studio",
    who: "Designers, illustrators and agencies",
    stages: ["New", "In progress", "With client", "Delivered"],
    clients: true,
    workspace: (n) => `${n}'s Studio`,
  },
  {
    key: "photo",
    title: "Photo & video",
    who: "Photographers and videographers",
    stages: ["Enquiry", "Booked", "Shoot", "Editing", "Delivered", "Paid"],
    clients: false,
    workspace: (n) => `${n} Photography`,
  },
  {
    key: "trades",
    title: "Trades & makers",
    who: "Signwriters, joiners, decorators and makers",
    stages: ["Quote sent", "Quote paid", "Design", "Building", "Finished"],
    clients: false,
    workspace: (n) => `${n}'s Workshop`,
  },
  {
    key: "events",
    title: "Events & hospitality",
    who: "Pubs, venues and event planners",
    stages: ["Idea", "Planning", "Promoting", "Event day", "Wrapped up"],
    clients: false,
    workspace: (n) => `${n}'s Events`,
  },
  {
    key: "content",
    title: "Content & marketing",
    who: "Social media, copywriting and marketing",
    stages: ["Ideas", "Drafting", "In review", "Scheduled", "Published"],
    clients: false,
    workspace: (n) => `${n}'s Content`,
  },
  {
    key: "personal",
    title: "Personal & everything else",
    who: "To-dos, side projects, anything",
    stages: ["To do", "Doing", "Done"],
    clients: false,
    workspace: (n) => `${n}'s Projects`,
  },
];
