# --- dev: hot reload via dotnet watch (compose watch syncs sources) ---
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS dev
WORKDIR /app
COPY . .
RUN dotnet restore src/Api/Api.csproj
EXPOSE 8080
CMD ["dotnet", "watch", "run", "--project", "src/Api", "--non-interactive", "--no-launch-profile"]

# --- prod (Phase 6 wires the SPA build into wwwroot) ---
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish src/Api/Api.csproj -c Release -o /out

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS prod
WORKDIR /app
COPY --from=build /out .
USER app
EXPOSE 8080
ENTRYPOINT ["dotnet", "Api.dll"]
