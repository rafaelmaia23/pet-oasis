// Índice do contrato. Cada domínio também é uma entrada própria do `exports`
// (`@pet-oasis/api-contracts/user`, `/pet`, `/catalog`, `/role`, `/feature`,
// `/errors`) — o consumidor importa só o que usa.
export * from "./catalog";
export * from "./domain-enums";
export * from "./errors";
export * from "./feature";
export * from "./pet";
export * from "./role";
export * from "./user";
