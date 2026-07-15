// Keep the runner minimal for a single local HTML file.
module.exports = {
  testDir: "./tests",
  use: {
    browserName: "chromium",
    headless: true
  }
};
