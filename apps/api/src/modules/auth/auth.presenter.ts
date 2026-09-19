import { sessionViews } from "@pet-oasis/api-contracts/auth";
import { createPresenter } from "@/utils/presenter";

export const sessionPresenter = createPresenter(sessionViews);
