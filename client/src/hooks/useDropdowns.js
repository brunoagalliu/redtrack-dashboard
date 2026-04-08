import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useOffers() {
  return useQuery({
    queryKey: ['offers'],
    queryFn: () => api.getOffers({ per: 500 }),
    select: (data) => (Array.isArray(data) ? data : data?.items ?? []),
  });
}

export function useLandings() {
  return useQuery({
    queryKey: ['landings'],
    queryFn: () => api.getLandings({ per: 500 }),
    select: (data) => (Array.isArray(data) ? data : data?.items ?? []),
  });
}

export function useDomains() {
  return useQuery({
    queryKey: ['domains'],
    queryFn: api.getDomains,
    select: (data) => (Array.isArray(data) ? data : data?.items ?? []),
  });
}

export function useSources() {
  return useQuery({
    queryKey: ['sources'],
    queryFn: api.getSources,
    select: (data) => (Array.isArray(data) ? data : data?.items ?? []),
  });
}
