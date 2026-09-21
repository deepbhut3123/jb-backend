const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeCompanyPersons(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((person) => person && typeof person === 'object' && !Array.isArray(person))
    .map((person) => {
      const normalized = {
        name: cleanString(person.name),
        role: cleanString(person.role) || cleanString(person.designation),
        number: cleanString(person.number) || cleanString(person.contactNumber),
        email: cleanString(person.email).toLowerCase(),
      };
      if (!Object.values(normalized).some(Boolean)) return null;
      const id = person._id ? String(person._id) : '';
      return /^[a-f\d]{24}$/i.test(id) ? { ...normalized, _id: id } : normalized;
    })
    .filter(Boolean);
}

export function serializeCompanyPersons(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((person) => {
      const [normalized] = normalizeCompanyPersons([person]);
      if (!normalized) return null;
      return { ...normalized, _id: person._id || normalized._id };
    })
    .filter(Boolean);
}

export function hasInvalidCompanyPersonEmail(companyPersons) {
  return companyPersons.some((person) => person.email && !emailPattern.test(person.email));
}
