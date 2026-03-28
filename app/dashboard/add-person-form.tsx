import { addPerson } from "./actions";

const sans = "var(--font-dg-body), Lato, sans-serif";
const serif = "var(--font-dg-display), 'Playfair Display', Georgia, serif";

const fieldClass =
  "w-full rounded-md px-3 py-2 outline-none transition focus:ring-2 focus:ring-[#2C4A3E]/35";

export default function AddPersonForm() {
  return (
    <section
      className="rounded-xl border p-6 shadow-sm"
      style={{
        backgroundColor: "#FFFCF7",
        borderColor: "#C4A882",
        boxShadow: "0 4px 20px rgba(61, 41, 20, 0.06)",
      }}
    >
      <h2
        className="text-xl font-bold"
        style={{ fontFamily: serif, color: "#3D2914" }}
      >
        Add a person
      </h2>
      <form action={addPerson} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="first_name"
              className="mb-1 block text-sm font-medium"
              style={{ fontFamily: sans, color: "#5C3D2E" }}
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
                borderColor: "#A08060",
                backgroundColor: "#FAF7F2",
                color: "#3D2914",
              }}
              placeholder="Given name"
            />
          </div>
          <div>
            <label
              htmlFor="middle_name"
              className="mb-1 block text-sm font-medium"
              style={{ fontFamily: sans, color: "#5C3D2E" }}
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
                borderColor: "#A08060",
                backgroundColor: "#FAF7F2",
                color: "#3D2914",
              }}
              placeholder="Optional"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="last_name"
            className="mb-1 block text-sm font-medium"
            style={{ fontFamily: sans, color: "#5C3D2E" }}
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
              borderColor: "#A08060",
              backgroundColor: "#FAF7F2",
              color: "#3D2914",
            }}
            placeholder="Family name"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="birth_date"
              className="mb-1 block text-sm font-medium"
              style={{ fontFamily: sans, color: "#5C3D2E" }}
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
                borderColor: "#A08060",
                backgroundColor: "#FAF7F2",
                color: "#3D2914",
              }}
            />
          </div>
          <div>
            <label
              htmlFor="death_date"
              className="mb-1 block text-sm font-medium"
              style={{ fontFamily: sans, color: "#5C3D2E" }}
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
                borderColor: "#A08060",
                backgroundColor: "#FAF7F2",
                color: "#3D2914",
              }}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="gender"
            className="mb-1 block text-sm font-medium"
            style={{ fontFamily: sans, color: "#5C3D2E" }}
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
              borderColor: "#A08060",
              backgroundColor: "#FAF7F2",
              color: "#3D2914",
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
            style={{ fontFamily: sans, color: "#5C3D2E" }}
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
              borderColor: "#A08060",
              backgroundColor: "#FAF7F2",
              color: "#3D2914",
            }}
            placeholder="Optional details"
          />
        </div>

        <button
          type="submit"
          className="rounded-md px-5 py-2.5 text-sm font-semibold transition hover:opacity-95"
          style={{
            fontFamily: sans,
            backgroundColor: "#3D2914",
            color: "#FFFCF7",
          }}
        >
          Add person
        </button>
      </form>
    </section>
  );
}
