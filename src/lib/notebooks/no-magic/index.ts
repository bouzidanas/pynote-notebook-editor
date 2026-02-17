// No-Magic AI notebook index
import { noMagicLandingCells } from "./landing";
import { microTokenizerCells } from "./foundations/microtokenizer";
import { microEmbeddingCells } from "./foundations/microembedding";
import { microGPTCells } from "./foundations/microgpt";
import { microRNNCells } from "./foundations/micrornn";
import { microConvCells } from "./foundations/microconv";
import { microBERTCells } from "./foundations/microbert";
import { microRAGCells } from "./foundations/microrag";
import { microOptimizerCells } from "./foundations/microoptimizer";
import { microGANCells } from "./foundations/microgan";
import { microDiffusionCells } from "./foundations/microdiffusion";
import { microVAECells } from "./foundations/microvae";
import type { NotebookConfig } from "../types";

// No-Magic notebook type identifiers (matching ?open= param values from landing page)
export type NoMagicType =
    | "no-magic"
    | "nm_microtokenizer"
    | "nm_microembedding"
    | "nm_microgpt"
    | "nm_micrornn"
    | "nm_microconv"
    | "nm_microbert"
    | "nm_microrag"
    | "nm_microoptimizer"
    | "nm_microgan"
    | "nm_microdiffusion"
    | "nm_microvae";

export const NO_MAGIC_CONFIG: Record<NoMagicType, NotebookConfig> = {
    "no-magic": {
        cells: noMagicLandingCells,
        filename: "No-Magic AI - Table of Contents.ipynb",
        showTrailingAddButtons: false,
    },
    "nm_microtokenizer": {
        cells: microTokenizerCells,
        filename: "No-Magic AI - MicroTokenizer.ipynb",
        codeview: { showResult: false },
        showTrailingAddButtons: false,
    },
    "nm_microembedding": {
        cells: microEmbeddingCells,
        filename: "No-Magic AI - MicroEmbedding.ipynb",
        codeview: { showResult: false },
        showTrailingAddButtons: false,
    },
    "nm_microgpt": {
        cells: microGPTCells,
        filename: "No-Magic AI - MicroGPT.ipynb",
        codeview: { showResult: false },
        showTrailingAddButtons: false,
    },
    "nm_micrornn": {
        cells: microRNNCells,
        filename: "No-Magic AI - MicroRNN.ipynb",
        codeview: { showResult: false },
        showTrailingAddButtons: false,
    },
    "nm_microconv": {
        cells: microConvCells,
        filename: "No-Magic AI - MicroConv.ipynb",
        codeview: { showResult: false },
        showTrailingAddButtons: false,
    },
    "nm_microbert": {
        cells: microBERTCells,
        filename: "No-Magic AI - MicroBERT.ipynb",
        codeview: { showResult: false },
        showTrailingAddButtons: false,
    },
    "nm_microrag": {
        cells: microRAGCells,
        filename: "No-Magic AI - MicroRAG.ipynb",
        codeview: { showResult: false },
        showTrailingAddButtons: false,
    },
    "nm_microoptimizer": {
        cells: microOptimizerCells,
        filename: "No-Magic AI - MicroOptimizer.ipynb",
        codeview: { showResult: false },
        showTrailingAddButtons: false,
    },
    "nm_microgan": {
        cells: microGANCells,
        filename: "No-Magic AI - MicroGAN.ipynb",
        codeview: { showResult: false },
        showTrailingAddButtons: false,
    },
    "nm_microdiffusion": {
        cells: microDiffusionCells,
        filename: "No-Magic AI - MicroDiffusion.ipynb",
        codeview: { showResult: false },
        showTrailingAddButtons: false,
    },
    "nm_microvae": {
        cells: microVAECells,
        filename: "No-Magic AI - MicroVAE.ipynb",
        codeview: { showResult: false },
        showTrailingAddButtons: false,
    },
};
