import DesignSystem from "../models/DesignSystem.js";
import TokenWorkspace from "../models/TokenWorkspace.js";

function getUserIdFromReq(req) {
  if (req.user?.id) return req.user.id;
  if (req.user?._id) return req.user._id;
  return null;
}

// GET /api/design-systems
export async function listDesignSystems(req, res, next) {
  let stage = "start";
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return res
        .status(401)
        .json({ ok: false, stage, message: "No user id in token" });
    }

    stage = "loadDesignSystems";
    const systems = await DesignSystem.find({ user: userId })
      .sort({ createdAt: 1 })
      .lean();

    return res.json({
      ok: true,
      stage,
      items: systems.map((ds) => ({
        id: ds._id,
        name: ds.name,
        createdAt: ds.createdAt,
        updatedAt: ds.updatedAt,
      })),
    });
  } catch (err) {
    console.error("listDesignSystems error", stage, err);
    next(err);
  }
}

export async function createDesignSystem(req, res, next) {
  let stage = "start";
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return res
        .status(401)
        .json({ ok: false, stage, message: "No user id in token" });
    }

    const name = String(req.body.name || "").trim();
    if (!name) {
      return res
        .status(400)
        .json({ ok: false, stage, message: "Name is required" });
    }

    stage = "create";
    const ds = await DesignSystem.create({ user: userId, name });

    return res.status(201).json({
      ok: true,
      stage,
      item: {
        id: ds._id,
        name: ds.name,
        createdAt: ds.createdAt,
        updatedAt: ds.updatedAt,
      },
    });
  } catch (err) {
    console.error("createDesignSystem error", stage, err);

    if (err.code === 11000) {
      // unique index violation
      return res.status(409).json({
        ok: false,
        stage,
        message: "You already have a design system with that name.",
      });
    }

    next(err);
  }
}

// PATCH /api/design-systems/:id
// body: { name: string }
export async function renameDesignSystem(req, res, next) {
  let stage = "start";
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return res
        .status(401)
        .json({ ok: false, stage, message: "No user id in token" });
    }

    const { id } = req.params;
    const name = String(req.body.name || "").trim();
    if (!name) {
      return res
        .status(400)
        .json({ ok: false, stage, message: "Name is required" });
    }

    stage = "update";
    const ds = await DesignSystem.findOneAndUpdate(
      { _id: id, user: userId },
      { name },
      { new: true }
    ).lean();

    if (!ds) {
      return res
        .status(404)
        .json({ ok: false, stage, message: "Design system not found" });
    }

    return res.json({
      ok: true,
      stage,
      item: {
        id: ds._id,
        name: ds.name,
        createdAt: ds.createdAt,
        updatedAt: ds.updatedAt,
      },
    });
  } catch (err) {
    console.error("renameDesignSystem error", stage, err);

    if (err.code === 11000) {
      return res.status(409).json({
        ok: false,
        stage,
        message: "You already have a design system with that name.",
      });
    }

    next(err);
  }
}

// DELETE /api/design-systems/:id
export async function deleteDesignSystem(req, res, next) {
  let stage = "start";
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return res
        .status(401)
        .json({ ok: false, stage, message: "No user id in token" });
    }

    const { id } = req.params;

    stage = "deleteDesignSystem";
    const ds = await DesignSystem.findOneAndDelete({
      _id: id,
      user: userId,
    }).lean();

    if (!ds) {
      return res
        .status(404)
        .json({ ok: false, stage, message: "Design system not found" });
    }

    stage = "deleteWorkspace";
    await TokenWorkspace.deleteMany({ user: userId, designSystem: id });

    return res.json({ ok: true, stage, message: "Design system deleted" });
  } catch (err) {
    console.error("deleteDesignSystem error", stage, err);
    next(err);
  }
}
