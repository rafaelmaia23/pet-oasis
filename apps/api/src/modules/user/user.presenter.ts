import { userViews } from "@pet-oasis/api-contracts/user";
import { createPresenter } from "@/utils/presenter";

// As views são contrato; o que fica aqui é a whitelist aplicada sobre elas.
export const userPresenter = createPresenter(userViews);
