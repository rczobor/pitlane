import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// One queue for every seller lookup keeps the geocoder at a polite pace (convex/geo.ts).
crons.interval("locate sellers", { minutes: 1 }, internal.geo.locatePending, {});

export default crons;
