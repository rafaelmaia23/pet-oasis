import { faker } from "@faker-js/faker";

export function makePassword(): string {
  const upper = faker.string.fromCharacters("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  const lower = faker.string.fromCharacters("abcdefghijklmnopqrstuvwxyz");
  const digit = faker.string.fromCharacters("0123456789");
  const special = faker.string.fromCharacters("@$!%*?&");
  const rest = faker.string.alphanumeric(8);

  return `${upper}${lower}${digit}${special}${rest}`;
}
