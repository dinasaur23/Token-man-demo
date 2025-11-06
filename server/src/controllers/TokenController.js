export const getAllTokens = (req, res) => {
  res.status(200).send("you just fetched the tokens");
};

export const createToken = (req, res) => {
  res.status(201).json({ message: "your token has been created" });
};

export const updateToken = (req, res) => {
  res.status(200).json({ message: "you token has been updated" });
};

export const deleteToken = (req, res) => {
  res.status(200).json({ message: "your tokens has been deleted" });
};
