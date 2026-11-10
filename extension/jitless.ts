// Extension pages forbid eval, which zod probes for while it builds each schema. This
// module only switches that off, and popup.ts imports it before anything that builds one.
import { z } from "zod";

z.config({ jitless: true });
