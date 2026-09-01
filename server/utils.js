const LA_TZ = 'America/Los_Angeles';

// Returns a YYYY-MM-DD string in LA timezone, offset by N whole days
function laDate(offsetDays = 0) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: LA_TZ }).format(
    new Date(Date.now() + offsetDays * 86400000)
  );
}

module.exports = { laDate };
