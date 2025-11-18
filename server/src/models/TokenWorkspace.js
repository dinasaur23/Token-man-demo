import mongoose from "mongoose";

const { Schema } = mongoose;

const fileSchema = new Schema(
  {
    name: { type: String, required: true },
    content: Schema.Types.Mixed, // raw JSON
  },
  { _id: false }
);

const tokenWorkspaceSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    files: {
      type: [fileSchema],
      default: [],
    },
    // 👉 just plain objects, no Map magic
    modifiers: {
      type: Schema.Types.Mixed,
      default: {},
    },
    overrides: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

const TokenWorkspace = mongoose.model("TokenWorkspace", tokenWorkspaceSchema);
export default TokenWorkspace;
