import { useEffect, useState } from "react";

const KEY = "rxevidence_api_key";

export function useApiKey() {
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    setApiKey(localStorage.getItem(KEY) || "");
  }, []);

  const saveApiKey = (value) => {
    localStorage.setItem(KEY, value.trim());
    setApiKey(value.trim());
  };

  const removeApiKey = () => {
    localStorage.removeItem(KEY);
    setApiKey("");
  };

  return { apiKey, hasApiKey: Boolean(apiKey), saveApiKey, removeApiKey };
}
