export interface FilingSection {
  name: string;
  charCount: number;
  content: string;
  title?: string;
  item?: string;
  form?: string;
  filingDate?: string;
  accessionNumber?: string;
  docUrl?: string;
  isFallback?: boolean;
}

export interface CompanyFilingMetadata {
  form: string;
  filingDate: string;
  accessionNumber: string;
  primaryDocument: string;
  accessionNoDashes?: string;
  docUrl?: string;
  reportDate?: string;
}

export interface FilingSectionsCollection extends Array<FilingSection> {
  item1_business?: FilingSection;
  item1a_risk_factors?: FilingSection;
  item7_mda?: FilingSection;
  item2_tenq_mda?: FilingSection;
  eightk_narrative?: FilingSection;
}

export interface SecFilingPackage {
  ticker: string;
  cik: string;
  unpaddedCik: string;
  companyName: string;
  filings: FilingMetadata[];
  sections: FilingSectionsCollection;
  totalChars: number;
  totalContextCharacters: number;
  assembledContext: string;
  fallbackSamplingUsed: boolean;
  filingsFound?: {
    tenK?: CompanyFilingMetadata;
    tenQ?: CompanyFilingMetadata;
    eightKs: CompanyFilingMetadata[];
  };
}

// Backward compatibility types
export interface CikInfo {
  cik: string;          // 10-digit zero-padded CIK e.g. "0000320193"
  unpaddedCik: string;  // unpadded integer string e.g. "320193"
  ticker: string;
  title: string;
}

export type ResolvedCik = string & CikInfo;

export type FormType = '10-K' | '10-Q' | '8-K' | '20-F' | '6-K' | string;

export interface ExtractedSection extends FilingSection {
  name: string;
}

export interface FilingMetadata extends CompanyFilingMetadata {
  accessionNoDashes: string;
  docUrl: string;
}

export interface SecFilingsResult extends SecFilingPackage {
  unpaddedCik: string;
  companyName: string;
  filings: FilingMetadata[];
  sections: FilingSectionsCollection;
  totalChars: number;
  assembledContext: string;
}

export type SecResult =
  | { success: true; data: SecFilingsResult }
  | { success: false; error: string; statusCode?: number };

export interface FilingRef {
  form: FormType;
  filingDate: string;
  accessionNumber: string;
  sourceUrl: string;
  sectionsUsed: string[];
}
