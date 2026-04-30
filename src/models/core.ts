export type UUID = string;
export type Year = number;
export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export type Dollars = number;
export type Rate = number;
export type Age = number;

export type FilingStatus =
  | "single"
  | "married_filing_jointly"
  | "married_filing_separately"
  | "head_of_household";

export type Sex = "male" | "female";

export type Owner = "self" | "spouse";
