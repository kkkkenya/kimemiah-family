import { describe, expect, it } from "vitest";
import { matchContact, sortContacts, telHref, type Contact } from "./contacts";

const c = (o: Partial<Contact> & { id: string; name: string }): Contact => o;

describe("contacts", () => {
  const plumber = c({ id: "1", name: "Otieno", role: "Plumber", area: "Kahawa Sukari", phone: "0722 123 456" });
  const clinic = c({ id: "2", name: "Kahawa clinic", role: "Clinic", is_emergency: true, phone: "+254 711 000 111" });
  const gas = c({ id: "3", name: "Gas delivery", role: "Gas", phone: "0733000222", sort: 1 });
  const gone = c({ id: "4", name: "Old fundi", deleted_at: "2026-10-01" });

  it("searches name, role, area, note and number", () => {
    expect(matchContact(plumber, "plumber kahawa")).toBe(true);
    expect(matchContact(plumber, "0722")).toBe(true);
    expect(matchContact(plumber, "722123")).toBe(true);
    expect(matchContact(plumber, "gas")).toBe(false);
    expect(matchContact(clinic, "")).toBe(true);
  });

  it("puts emergency numbers first and hides removed ones", () => {
    expect(sortContacts([plumber, gas, gone, clinic]).map((x) => x.id)).toEqual(["2", "1", "3"]);
  });

  it("dials Kenyan numbers in full", () => {
    expect(telHref("0722 123 456")).toBe("tel:+254722123456");
    expect(telHref("0110 000 000")).toBe("tel:+254110000000");
    expect(telHref("254733000222")).toBe("tel:+254733000222");
    expect(telHref("+254 711 000 111")).toBe("tel:+254711000111");
    expect(telHref("")).toBeNull();
  });
});
