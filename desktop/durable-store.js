// Persist a complete encrypted store before acknowledging any queue mutation.
// Validation/failed writes leave the previous primary and recovery copy intact.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
function durableReplace(file, data, io = fs) {
  const tmp = `${file}.${crypto.randomBytes(8).toString("hex")}.tmp`;
  let fd;
  try {
    fd = io.openSync(tmp, "wx", 0o600);
    io.writeFileSync(fd, data);
    io.fsyncSync(fd);
    io.closeSync(fd); fd = undefined;
    io.renameSync(tmp, file);
    // Windows may not allow opening/flushing directories; the file itself was flushed.
    let directory;
    try { directory = io.openSync(path.dirname(file), "r"); io.fsyncSync(directory); } catch { /* best effort directory metadata */ }
    finally { if (directory !== undefined) io.closeSync(directory); }
  } finally {
    if (fd !== undefined) io.closeSync(fd);
    if (io.existsSync(tmp)) io.unlinkSync(tmp);
  }
}
function atomicWriteWithBackup(file, data, validate, io = fs) {
  validate(data);
  let previous;
  if (io.existsSync(file)) { previous = io.readFileSync(file); validate(previous); }
  if (previous) durableReplace(file + ".bak", previous, io);
  durableReplace(file, data, io);
}
function recoverMissingPrimary(file, validate, io = fs) {
  if (io.existsSync(file) || !io.existsSync(file + ".bak")) return false;
  const recovery = io.readFileSync(file + ".bak");
  validate(recovery);
  durableReplace(file, recovery, io);
  return true;
}
module.exports = { atomicWriteWithBackup, recoverMissingPrimary };
