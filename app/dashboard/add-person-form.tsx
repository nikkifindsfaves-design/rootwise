import { addPerson } from "./actions";

const sans = "var(--font-dg-body), Lato, sans-serif";
const serif = "var(--font-dg-display), 'Playfair Display', Georgia, serif";

const fieldClass =
  "w-full rounded-md px-3 py-2 outline-none transition focus:ring-2 focus:ring-[color-mix(in_srgb,var(--dg-forest)_35%,transparent)]";

export default function AddPersonForm() {
  return (
    <section
      className="rounded-xl border p-6 shadow-sm"
      style={{
        backgroundColor: "var(--dg-cream)",
        borderColor: "var(--dg-paper-border)",
        boxShadow: "0 4px 20px rgb(var(--dg-shadow-rgb) / 0.06)",
      }}
    >
      <h2
        className="text-xl font-bold"
        style={{ fontFamily: serif, color: "var(--dg-brown-dark)" }}
      >
        Add a person
      </h2>
      <form action={addPerson} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="first_name"
              className="mb-1 block text-sm font-medium"
              style={{ fontFamily: sans, color: "var(--dg-brown-mid)" }}
            >
              First name
            </label>
            <input
              id="first_name"
              name="first_name"
              type="text"
              required
              className={fieldClass}
              style={{
                fontFamily: sans,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "var(--dg-brown-border)",
                backgroundColor: "var(--dg-bg-main)",
                color: "var(--dg-brown-dark)",
              }}
              placeholder="Given name"
            />
          </div>
          <div>
            <label
              htmlFor="middle_name"
              className="mb-1 block text-sm font-medium"
              style={{ fontFamily: sans, color: "var(--dg-brown-mid)" }}
            >
              Middle name
            </label>
            <input
              id="middle_name"
              name="middle_name"
              type="text"
              className={fieldClass}
              style={{
                fontFamily: sans,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "var(--dg-brown-border)",
                backgroundColor: "var(--dg-bg-main)",
                color: "var(--dg-brown-dark)",
              }}
              placeholder="Optional"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="last_name"
            className="mb-1 block text-sm font-medium"
            style={{ fontFamily: sans, color: "var(--dg-brown-mid)" }}
          >
            Last name
          </label>
          <input
            id="last_name"
            name="last_name"
            type="text"
            required
            className={fieldClass}
            style={{
              fontFamily: sans,
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: "var(--dg-brown-border)",
              backgroundColor: "var(--dg-bg-main)",
              color: "var(--dg-brown-dark)",
            }}
            placeholder="Family name"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="birth_date"
              className="mb-1 block text-sm font-medium"
              style={{ fontFamily: sans, color: "var(--dg-brown-mid)" }}
            >
              Birth date
            </label>
            <input
              id="birth_date"
              name="birth_date"
              type="date"
              className={fieldClass}
              style={{
                fontFamily: sans,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "var(--dg-brown-border)",
                backgroundColor: "var(--dg-bg-main)",
                color: "var(--dg-brown-dark)",
              }}
            />
          </div>
          <div>
            <label
              htmlFor="death_date"
              className="mb-1 block text-sm font-medium"
              style={{ fontFamily: sans, color: "var(--dg-brown-mid)" }}
            >
              Death date
            </label>
            <input
              id="death_date"
              name="death_date"
              type="date"
              className={fieldClass}
              style={{
                fontFamily: sans,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "var(--dg-brown-border)",
                backgroundColor: "var(--dg-bg-main)",
                color: "var(--dg-brown-dark)",
              }}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="gender"
            className="mb-1 block text-sm font-medium"
            style={{ fontFamily: sans, color: "var(--dg-brown-mid)" }}
          >
            Gender
          </label>
          <select
            id="gender"
            name="gender"
            defaultValue="Unknown"
            className={`${fieldClass} sm:max-w-xs`}
            style={{
              fontFamily: sans,
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: "var(--dg-brown-border)",
              backgroundColor: "var(--dg-bg-main)",
              color: "var(--dg-brown-dark)",
            }}
          >
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Unknown">Unknown</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="notes"
            className="mb-1 block text-sm font-medium"
            style={{ fontFamily: sans, color: "var(--dg-brown-mid)" }}
          >
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            className={`${fieldClass} resize-y`}
            style={{
              fontFamily: sans,
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: "var(--dg-brown-border)",
              backgroundColor: "var(--dg-bg-main)",
              color: "var(--dg-brown-dark)",
            }}
            placeholder="Optional details"
          />
        </div>

        <button
          type="submit"
          className="rounded-md px-5 py-2.5 text-sm font-semibold transition hover:opacity-95"
          style={{
            fontFamily: sans,
            backgroundColor: "var(--dg-primary-bg)",
            color: "var(--dg-primary-fg)",
          }}
        >
          Add person
        </button>
      </form>
    </section>
  );
}
