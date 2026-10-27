import { componentProfile, setHostProfile } from "../lib/host";

// First import of the browser entry: the stores read the host profile when
// they load (no app-wide settings, no notebook files).
setHostProfile(componentProfile());
