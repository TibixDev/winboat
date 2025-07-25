$hasSession = [bool](qwinsta | Select-String 'rdp-tcp.*Active');
@{ 'rdpConnected' = $hasSession } | ConvertTo-Json