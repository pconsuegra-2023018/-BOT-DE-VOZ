import Retell from 'retell-sdk';
import dotenv from 'dotenv';

dotenv.config();

const retellClient = new Retell({
  apiKey: process.env.RETELL_API_KEY,
});

export default retellClient;