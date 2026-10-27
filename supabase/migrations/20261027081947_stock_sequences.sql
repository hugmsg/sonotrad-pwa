-- Stock : compteurs des tables stock_* réservés au serveur (comme les autres séquences).
REVOKE ALL ON SEQUENCE public.stock_articles_ordre_seq, public.stock_favoris_ordre_seq,
                       public.stock_mouvements_id_seq, public.stock_mouvements_supprimes_id_seq
  FROM anon, authenticated;
