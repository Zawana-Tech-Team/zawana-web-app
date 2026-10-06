import "dotenv/config";

export type AuthMode="database"|"firebase";

const authMode=process.env.AUTH_MODE||"firebase";
if(authMode!=="database"&&authMode!=="firebase")throw new Error("AUTH_MODE must be either 'database' or 'firebase'.");

const databaseUrl=process.env.DATABASE_URL||"";
const jwtSecret=process.env.JWT_SECRET||"";
if(authMode==="database"){
  if(process.env.NODE_ENV==="production"||!databaseUrl.startsWith("file:"))throw new Error("Database username/password authentication is for local SQLite development only. Use Firebase Authentication outside local development.");
  if(jwtSecret.length<32||jwtSecret.startsWith("replace-with-"))throw new Error("Set JWT_SECRET to a private random value of at least 32 characters.");
}

const port=Number(process.env.PORT||8000);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error("PORT must be a valid TCP port number.");

export const env={
  authMode:authMode as AuthMode,
  databaseAuthEnabled:authMode==="database",
  databaseUrl,
  jwtSecret,
  port,
  clientUrls:process.env.CLIENT_URL?.split(",").map(value=>value.trim()).filter(Boolean)||["http://localhost:5173"],
  publicApiUrl:process.env.PUBLIC_API_URL||`http://localhost:${port}`,
};
