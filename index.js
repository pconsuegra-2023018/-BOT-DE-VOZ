import { initServer } from "./config/app.js";
import { config } from "dotenv";

config();
initServer();