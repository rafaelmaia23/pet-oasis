import {
  productImageViews,
  productListViews,
  productViews,
  variantViews,
} from "@pet-oasis/api-contracts/catalog";
import { createPresenter } from "@/utils/presenter";

// As views (a escada `public`/`internal`/`cost`, detalhe × lista) são
// contrato; aqui só se aplica a whitelist. Quem escolhe o degrau pela
// feature efetiva do viewer é `readViewFor`, no service.
export const productPresenter = createPresenter(productViews);

export const productListPresenter = createPresenter(productListViews);

export const productImagePresenter = createPresenter(productImageViews);

export const variantPresenter = createPresenter(variantViews);
