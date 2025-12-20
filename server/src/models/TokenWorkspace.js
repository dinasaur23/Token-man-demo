import mongoose from "mongoose";

const { Schema } = mongoose;

const fileSchema = new Schema(
  {
    name: { type: String, required: true },
    content: Schema.Types.Mixed,
  },
  { _id: false }
);

const tokenWorkspaceSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    designSystem: {
      type: Schema.Types.ObjectId,
      ref: "DesignSystem",
      required: true,
    },
    files: {
      type: [fileSchema],
      default: [],
    },
    modifiers: {
      type: Schema.Types.Mixed,
      default: {},
    },
    scopedModifiers: {
      type: Schema.Types.Mixed,
      default: {},
    },
    overrides: {
      type: Schema.Types.Mixed,
      default: {},
    },
    nameOverrides: { type: Schema.Types.Mixed, default: {} },
    rowOrder: { type: [String], default: [] },
    figmaTokens: {
      type: Schema.Types.Mixed,
      default: {},
    },
    figmaModifierOptions: {
      type: Schema.Types.Mixed,
      default: {},
    },
    groupNameOverrides: {
      type: Object,
      default: {},
    },
    modeAddedRows: { type: Object, default: {} },
    modeDeletedPaths: { type: Object, default: {} },
  },

  { timestamps: true }
);

tokenWorkspaceSchema.index({ user: 1, designSystem: 1 }, { unique: true });

const TokenWorkspace = mongoose.model("TokenWorkspace", tokenWorkspaceSchema);
export default TokenWorkspace;
