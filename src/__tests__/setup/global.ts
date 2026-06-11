import { execSync } from "child_process";

export default function setup() {
  execSync(
    "DATABASE_URL=postgresql://postgres:postgres@localhost:5433/pet_oasis_test prisma migrate deploy",
    { stdio: "inherit" },
  );

  execSync(
    "DATABASE_URL=postgresql://postgres:postgres@localhost:5433/pet_oasis_test prisma db seed",
    { stdio: "inherit" },
  );
}
