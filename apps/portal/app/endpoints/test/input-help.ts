/** Plain-language labels for taught form inputs on the test page. */

export type InputHelp = {
  title: string;
  hint: string;
  placeholder: string;
  apiKey: string;
};

export function inputHelp(apiKey: string): InputHelp {
  const normalized = apiKey.toLowerCase().replace(/-/g, "_");

  if (
    normalized === "query" ||
    normalized === "q" ||
    normalized.includes("search") ||
    normalized === "company_name" ||
    normalized === "company_number" ||
    /^input\d*$/.test(normalized)
  ) {
    return {
      apiKey,
      title: "What to search for",
      hint: "Type the same kind of text you would type on the website — for example a company name or registration number. You do not type the word “query” unless you are literally searching for that word.",
      placeholder: "e.g. tesco or 00445790",
    };
  }

  if (normalized.includes("postcode") || normalized.includes("zip")) {
    return {
      apiKey,
      title: "Postcode",
      hint: "Enter a postcode the form on the live site would accept.",
      placeholder: "e.g. SW1A 1AA",
    };
  }

  if (normalized.includes("email")) {
    return {
      apiKey,
      title: "Email address",
      hint: "Enter an email the form on the live site would accept.",
      placeholder: "e.g. name@example.com",
    };
  }

  const title = apiKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    apiKey,
    title,
    hint: `Value for the “${apiKey}” field you mapped when teaching this endpoint.`,
    placeholder: "Enter a test value",
  };
}
