import { createContext, useContext } from "solid-js";

export interface FormContextValue {
  formId: string;
  registerChild: (componentId: string) => void;
  unregisterChild: (componentId: string) => void;
  getChildValue: (componentId: string) => any;
  setChildValue: (componentId: string, value: any) => void;
}

export const FormContext = createContext<FormContextValue | undefined>(undefined);

export function useFormContext() {
  return useContext(FormContext);
}
