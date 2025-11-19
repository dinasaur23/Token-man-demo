import TokenWorkspace from "../models/TokenWorkspace.js";

function getUserIdFromReq(req) {
  if (req.user?.id) return req.user.id;
  if (req.user?._id) return req.user._id;
  return null;
}

export async function getWorkspace(req, res, next) {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      console.warn("getWorkspace: no user id in token", req.user);
      return res.json({ files: [], modifiers: {}, overrides: {} });
    }

    const workspace = await TokenWorkspace.findOne({ user: userId }).lean();
    console.log("getWorkspace: found?", !!workspace);

    if (!workspace) {
      return res.json({
        files: [],
        modifiers: {},
        overrides: {},
        nameOverrides: {},
      });
    }
    res.json({
      files: workspace.files ?? [],
      modifiers: workspace.modifiers ?? {},
      overrides: workspace.overrides ?? {},
      nameOverrides: workspace.nameOverrides ?? {},
    });
  } catch (err) {
    console.error("getWorkspace error", err);
    next(err);
  }
}

export async function saveWorkspace(req, res, next) {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      console.error("saveWorkspace: no user id in token", req.user);
      return res
        .status(400)
        .json({ ok: false, message: "No user id in token" });
    }

    const { files, modifiers, overrides, nameOverrides } = req.body;

    console.log(
      "saveWorkspace user",
      userId,
      "files:",
      Array.isArray(files) ? files.length : 0
    );

    const workspaceData = {
      user: userId,
      files: Array.isArray(files) ? files : [],
      modifiers: modifiers ?? {},
      overrides: overrides ?? {},
      nameOverrides: nameOverrides ?? {},
    };

    const workspace = await TokenWorkspace.findOneAndUpdate(
      { user: userId },
      workspaceData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    res.json({
      files: workspace.files ?? [],
      modifiers: workspace.modifiers ?? {},
      overrides: workspace.overrides ?? {},
      nameOverrides: workspace.nameOverrides ?? {},
    });
  } catch (err) {
    console.error("saveWorkspace error", err);
    next(err);
  }
}
