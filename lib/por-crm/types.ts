/** Compact POR CRM records — original keys preserved; joins happen at query time. */

export interface PorCrmMeta {
  syncedAt: string;
  source: string;
  counts: {
    customers: number;
    jobSites: number;
    comments: number;
    transactions: number;
    transactionItems: number;
    payments: number;
    paymentDetails: number;
    items: number;
  };
}

export interface PorCustomerRecord {
  /** CustomerFile.CNUM — primary key */
  cnum: string;
  /** CustomerFile.KEY */
  key?: string;
  name: string;
  address?: string;
  address2?: string;
  city?: string;
  zip?: string;
  phone?: string;
  work?: string;
  mobile?: string;
  email?: string;
  status?: string;
  type?: string;
  openDate?: string;
  lastActive?: string;
  lastContract?: string;
  creditLimit?: number;
  currentBalance?: number;
  highBalance?: number;
  lastPayAmount?: number;
  lastPayDate?: string;
  numberContracts?: number;
  salesman?: string;
  taxCode?: string;
  billContact?: string;
  billPhone?: string;
  message?: string;
}

export interface PorJobSiteRecord {
  number?: string;
  cnum: string;
  description?: string;
  contactName?: string;
  contactPhone?: string;
  siteAddress?: string;
  siteCity?: string;
  siteZip?: string;
  siteNotes?: string;
  poNumber?: string;
  jobNumber?: string;
  projectStartDate?: string;
  projectEndDate?: string;
  siteDeliveryInstructions?: string;
}

export interface PorCustomerCommentRecord {
  cnum: string;
  comments: string;
}

export interface PorTransactionRecord {
  /** Transactions.CNTR */
  cntr: string;
  date?: string;
  time?: string;
  /** Status: R/O firm, Q quote, etc. */
  stat?: string;
  /** CustomerFile.CNUM */
  cusn: string;
  totl?: number;
  paid?: number;
  rent?: number;
  sale?: number;
  tax?: number;
  dpmt?: number;
  pymt?: number;
  deliveryDate?: string;
  pickupDate?: string;
  eventEndDate?: string;
  contact?: string;
  contactPhone?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryZip?: string;
  jobSite?: string;
  deliveryNotes?: string;
  transactionType?: string;
  salesman?: string;
  completed?: string;
  billed?: string;
}

export interface PorTransactionItemRecord {
  cntr: string;
  /** ItemFile.NUM */
  item: string;
  qty: number;
  pric?: number;
  desc?: string;
  comments?: string;
  lineNumber?: number;
  outDate?: string;
  taxAmount?: number;
  dailyAmount?: number;
}

export interface PorPaymentRecord {
  payment: string;
  date?: string;
  type?: string;
  custNumb?: string;
  amount?: number;
  meth?: string;
  refNo?: string;
  notes?: string;
  tendered?: number;
  transType?: string;
  /** Never store Encrypted / EncryptedCard / CCAlias */
}

export interface PorPaymentDetailRecord {
  payment: string;
  /** Transactions.CNTR */
  contract: string;
  amount?: number;
  discount?: number;
}

export interface PorItemRecord {
  /** ItemFile.KEY (SKU) */
  key: string;
  /** ItemFile.NUM — TransactionItems.ITEM join */
  num: string;
  name: string;
  loc?: string;
  qty?: number;
  qyot?: number;
  category?: string;
  type?: string;
  rate1?: number;
  sell?: number;
  partNumber?: string;
}

export interface PorContractBalance {
  cntr: string;
  cusn: string;
  customerName?: string;
  totl: number;
  paid: number;
  /** TOTL - PAID from transaction row */
  balance: number;
  /** Sum of PaymentDetail.Amount for this contract */
  paymentDetailTotal: number;
  paymentCount: number;
  stat?: string;
  deliveryDate?: string;
  pickupDate?: string;
}

export interface PorCustomerHistory {
  customer: PorCustomerRecord;
  jobSites: PorJobSiteRecord[];
  comments: PorCustomerCommentRecord[];
  contracts: Array<{
    cntr: string;
    date?: string;
    stat?: string;
    totl?: number;
    paid?: number;
    balance?: number;
    deliveryDate?: string;
    pickupDate?: string;
    contact?: string;
  }>;
  payments: PorPaymentRecord[];
}
