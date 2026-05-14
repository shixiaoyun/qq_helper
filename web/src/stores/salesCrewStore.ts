import { create } from 'zustand'

interface Customer {
  id: number
  name: string
  company?: string | null
  status?: string | null
  niuma_metadata?: string | null
  followUpCount?: number
}

interface SalesCrewStore {
  targetCustomer: Customer | null
  openForCustomer: (customer: Customer) => void
  closePanel: () => void
}

export const useSalesCrewStore = create<SalesCrewStore>((set) => ({
  targetCustomer: null,
  openForCustomer: (customer) => set({ targetCustomer: customer }),
  closePanel: () => set({ targetCustomer: null }),
}))
